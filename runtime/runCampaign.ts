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
import { researchAccount } from "../agents/researchAgent.js";
import { findContacts } from "../agents/contactAgent.js";
import { findEmailForContact } from "../agents/emailFinderAgent.js";
import { writeAndCritiqueEmail } from "../agents/criticAgent.js";
import { buildTaskGraph, expandAccountTasks, expandContactTasks, type TaskKind } from "../agents/plannerAgent.js";
import { createRun, markRunDone, markRunFailed } from "../tools/supabase.js";
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
}

const POOL_BY_KIND: Record<TaskKind, string> = {
  find_accounts: "openai",
  evaluate_strategy: "supabase", // no external API call, just the setMemory write
  research_account: "openai",
  find_contacts: "openai",
  find_email: "prospeo",
  write_and_critique_email: "openai",
};

export async function runCampaign(brief: CampaignBrief, deps: RunCampaignDeps): Promise<RunCampaignResult> {
  const runId = await createRun();
  const scheduler = defaultScheduler((pool, reason) => {
    console.warn(`[scheduler] skipped work on pool "${pool}": ${reason}`);
  });

  const accountByKey = new Map<string, Account>();
  const contactsByAccount: Record<string, Contact[]> = {};
  const researchByAccount: Record<string, ResearchBrief> = {};
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

    evaluate_strategy: async (task) => {
      const account = accountByKey.get(task.accountKey!)!;
      const verdict = evaluateAccount(account);
      await setMemory(runId, memoryKeys.strategy(task.accountKey!), verdict);
      if (!verdict.pursue) {
        notFoundDetail.push({ company: account.company, reason: `Strategy gate: ${verdict.reason}` });
      }
      return verdict;
    },

    research_account: async (task, ctx) => {
      const account = accountByKey.get(task.accountKey!)!;
      const verdict = ctx.results.get(`strategy:${task.accountKey}`) as StrategyVerdict;
      if (!verdict.pursue) return null;
      const research = await researchAccount(account, deps);
      await setMemory(runId, memoryKeys.research(task.accountKey!), research);
      researchByAccount[account.company] = research;
      return research;
    },

    find_contacts: async (task, ctx) => {
      const account = accountByKey.get(task.accountKey!)!;
      const verdict = ctx.results.get(`strategy:${task.accountKey}`) as StrategyVerdict;
      if (!verdict.pursue) return null;
      const contacts = await findContacts(account, brief, deps);
      await setMemory(runId, memoryKeys.contacts(task.accountKey!), contacts);
      contactsByAccount[account.company] = contacts;
      if (!contacts.length) {
        notFoundDetail.push({ company: account.company, reason: "No role-fitting, sourced contacts found." });
        return contacts;
      }
      ctx.addTasks(expandContactTasks(task.accountKey!, contacts.length));
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
      contactsByAccount[account.company][task.contactIndex!] = { ...contact, draft };
      return draft;
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

    return { summary, accounts, contactsByAccount, researchByAccount };
  } catch (err) {
    await markRunFailed(runId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
