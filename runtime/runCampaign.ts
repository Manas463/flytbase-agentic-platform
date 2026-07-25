// The actual orchestrator. Execution is now genuinely driven by
// agents/plannerAgent.ts's task graph via taskGraphExecutor.ts, not
// hand-nested Promise.all calls - account-level and contact-level tasks
// expand dynamically as their real counts become known, and everything runs
// through the same Scheduler pools as before for concurrency/credit limits.
//
// Final results are persisted into the same production tables
// pipeline-review's frontend reads, via persistResults() / the existing
// `import_run_results` RPC (contract confirmed against the real n8n node
// code AND proven with a live round-trip test, not guessed).
import type {
  Account,
  CampaignBrief,
  Contact,
  ResearchBrief,
  RunSummary,
  StrategyVerdict,
} from "../agents/types.js";
import { findAccounts } from "../agents/accountAgent.js";
import { evaluateAccount } from "../agents/strategyAgent.js";
import { reflectOnStrategy } from "../agents/reflectionAgent.js";
import { researchAccount, researchAccountGaps } from "../agents/researchAgent.js";
import { findContacts, findContactsForGaps } from "../agents/contactAgent.js";
import { findEmailForContact } from "../agents/emailFinderAgent.js";
import { writeAndCritiqueEmail, writeAndCritiqueFollowUp } from "../agents/criticAgent.js";
import type { FollowUpContext } from "../skills/followUpWriting.js";
import {
  buildTaskGraph,
  expandAccountTasks,
  expandContactTasks,
  expandStrategyRetryTasks,
  type TaskKind,
} from "../agents/plannerAgent.js";
import { markRunDone, markRunFailed } from "../tools/supabase.js";
import { setMemory, memoryKeys } from "./sharedMemory.js";
import { defaultScheduler } from "./scheduler.js";
import { runTaskGraph, type TaskContext, type TaskExecutor } from "./taskGraphExecutor.js";
import { persistResults } from "./persistResults.js";

export interface RunCampaignDeps {
  openaiApiKey: string;
  tavilyApiKey: string;
  prospeoKey: string;
  hunterKey: string;
  model?: string;
}

export interface RunCampaignResult {
  summary: RunSummary;
  accounts: Account[];
  contactsByAccount: Record<string, Contact[]>; // each contact carries its resolved email + .draft, if any
  researchByAccount: Record<string, ResearchBrief>;
  strategyByAccount: Record<string, StrategyVerdict>;
}

const POOL_BY_KIND: Record<TaskKind, string> = {
  find_accounts: "openai",
  evaluate_strategy: "supabase", // no external API call, just the setMemory write
  research_account: "openai",
  find_contacts: "openai",
  research_strategy_gaps: "openai",
  search_strategy_contacts: "openai",
  find_email: "prospeo",
  write_and_critique_email: "openai",
};

/** Takes an already-created runId rather than creating one itself, so a
 * caller (backend/server.ts) can respond to its client with the run id
 * immediately and let the campaign continue in the background - the same
 * "respond right away, poll for completion" contract the old n8n webhook
 * already used, which the frontend still expects. */
export async function runCampaign(
  runId: string,
  brief: CampaignBrief,
  deps: RunCampaignDeps
): Promise<RunCampaignResult> {
  const scheduler = defaultScheduler((pool, reason) => {
    console.warn(`[scheduler] skipped work on pool "${pool}": ${reason}`);
  });

  const accountByKey = new Map<string, Account>();
  const contactsByAccount: Record<string, Contact[]> = {};
  const researchByAccount: Record<string, ResearchBrief> = {};
  const strategyByAccount: Record<string, StrategyVerdict> = {};
  const notFoundDetail: { company: string; reason: string }[] = [];
  let emailsGenerated = 0;
  let accountsFound = 0;

  const executors: Record<TaskKind, TaskExecutor> = {
    find_accounts: async (_task, ctx: TaskContext) => {
      const accounts = await findAccounts(runId, brief, deps);
      accountsFound = accounts.length;
      await setMemory(runId, memoryKeys.accounts(), accounts);
      for (const account of accounts) accountByKey.set(account.company, account);
      ctx.addTasks(expandAccountTasks(accounts.map((a) => a.company)));
      return accounts;
    },

    research_account: async (task) => {
      const account = accountByKey.get(task.accountKey!)!;
      const research = await researchAccount(account, deps);
      await setMemory(runId, memoryKeys.research(task.accountKey!), research);
      researchByAccount[account.company] = research;
      return research;
    },

    find_contacts: async (task) => {
      const account = accountByKey.get(task.accountKey!)!;
      const contacts = await findContacts(account, brief, deps);
      await setMemory(runId, memoryKeys.contacts(task.accountKey!), contacts);
      contactsByAccount[account.company] = contacts;
      return contacts;
    },

    evaluate_strategy: async (task, ctx) => {
      const accountKey = task.accountKey!;
      const account = accountByKey.get(accountKey)!;
      const research = researchByAccount[account.company];
      const contacts = contactsByAccount[account.company] ?? [];
      const verdict = evaluateAccount(account, research, contacts, { attempt: task.attempt ?? 0 });
      const reflection = reflectOnStrategy(verdict);

      strategyByAccount[account.company] = verdict;
      await Promise.all([
        setMemory(runId, memoryKeys.strategy(accountKey), verdict),
        setMemory(runId, memoryKeys.strategyAttempt(accountKey, verdict.attempt), verdict),
        setMemory(runId, memoryKeys.reflection("strategy", `${accountKey}:${verdict.attempt}`), reflection),
      ]);

      if (verdict.status === "needs_more_research") {
        const owners = [...new Set(verdict.gaps.map((gap) => gap.owner))];
        ctx.addTasks(expandStrategyRetryTasks(accountKey, verdict.attempt + 1, owners));
      } else if (verdict.status === "pursue") {
        if (contacts.length) {
          ctx.addTasks(expandContactTasks(accountKey, contacts.length, task.id));
        } else {
          notFoundDetail.push({ company: account.company, reason: "No role-fitting, sourced contacts found after targeted search." });
        }
      } else {
        notFoundDetail.push({ company: account.company, reason: `Strategy gate: ${verdict.reason}` });
      }
      return verdict;
    },

    research_strategy_gaps: async (task, ctx) => {
      const accountKey = task.accountKey!;
      const account = accountByKey.get(accountKey)!;
      const prior = ctx.results.get(`strategy:${accountKey}:${(task.attempt ?? 1) - 1}`) as StrategyVerdict;
      const research = await researchAccountGaps(account, researchByAccount[account.company], prior.gaps, deps);
      researchByAccount[account.company] = research;
      await setMemory(runId, memoryKeys.research(accountKey), research);
      return research;
    },

    search_strategy_contacts: async (task, ctx) => {
      const accountKey = task.accountKey!;
      const account = accountByKey.get(accountKey)!;
      const prior = ctx.results.get(`strategy:${accountKey}:${(task.attempt ?? 1) - 1}`) as StrategyVerdict;
      const contacts = await findContactsForGaps(
        account,
        brief,
        contactsByAccount[account.company] ?? [],
        prior.gaps,
        deps
      );
      contactsByAccount[account.company] = contacts;
      await setMemory(runId, memoryKeys.contacts(accountKey), contacts);
      return contacts;
    },

    find_email: async (task) => {
      const account = accountByKey.get(task.accountKey!)!;
      const contact = contactsByAccount[account.company][task.contactIndex!];
      const resolved = await findEmailForContact(contact, account, deps);
      contactsByAccount[account.company][task.contactIndex!] = resolved;
      if (!resolved.email) {
        notFoundDetail.push({ company: account.company, reason: `No email resolved for ${contact.name}` });
      }
      return resolved;
    },

    write_and_critique_email: async (task, ctx) => {
      const account = accountByKey.get(task.accountKey!)!;
      const contact = contactsByAccount[account.company][task.contactIndex!];
      if (!contact.email) return null; // gate: never spend a write+critique call on an unreachable contact

      const research = researchByAccount[account.company];
      const draft = await writeAndCritiqueEmail({ account, contact, research, batchIndex: task.contactIndex!, deps });
      if (!draft) {
        notFoundDetail.push({
          company: account.company,
          reason: `Email drafting skipped for ${contact.name}, openai pool exhausted`,
        });
        return null;
      }
      await setMemory(runId, memoryKeys.emailDraft(`${task.accountKey}::${task.contactIndex}`), draft);
      emailsGenerated += 1;

      // Same thread, same sender, same real mechanism the cold email used -
      // three follow-ups are generated right away rather than as a separate
      // task kind, since they only ever depend on this one cold email.
      const followUpCtx: FollowUpContext = {
        account,
        contact: { ...contact, email: contact.email },
        research,
        senderName: draft.senderName,
        coldEmailSubject: draft.subject,
        coldEmailBody: draft.body,
        mechanism: draft.signalUsed,
      };
      const followUps = await Promise.all(
        ([1, 2, 3] as const).map((idx) => writeAndCritiqueFollowUp(idx, followUpCtx, deps))
      );
      await setMemory(runId, memoryKeys.followUps(`${task.accountKey}::${task.contactIndex}`), followUps);

      contactsByAccount[account.company][task.contactIndex!] = { ...contact, draft, followUps };
      return { draft, followUps };
    },
  };

  try {
    await runTaskGraph(buildTaskGraph(), executors, scheduler, POOL_BY_KIND);

    const summary: RunSummary = {
      id: runId,
      status: "done",
      accountsFound,
      emailsGenerated,
      contactsNotFound: notFoundDetail.length,
      contactsNotFoundDetail: notFoundDetail,
      error: null,
    };

    const accounts = Array.from(accountByKey.values());
    await persistResults(runId, { accounts, contactsByAccount, researchByAccount, summary });
    await markRunDone(runId, {
      accountsFound: summary.accountsFound,
      emailsGenerated: summary.emailsGenerated,
      contactsNotFound: summary.contactsNotFound,
      contactsNotFoundDetail: notFoundDetail,
    });

    return { summary, accounts, contactsByAccount, researchByAccount, strategyByAccount };
  } catch (err) {
    await markRunFailed(runId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
