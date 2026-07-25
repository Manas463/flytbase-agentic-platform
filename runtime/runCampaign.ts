// The actual orchestrator: wires Planner -> Strategy -> Research/Contacts ->
// Email Finder -> Writer/Critic together, using the Scheduler for concurrency
// and Shared Memory for intermediate persistence per run. This is the
// runtime-layer equivalent of the old n8n canvas's node wiring, expressed as
// code instead of a fixed visual chain, with the Strategy Agent's pursue-gate
// actually skipping downstream work (real dynamic behavior the n8n version
// never had).
//
// Final results ARE now persisted into the same production tables
// pipeline-review's frontend reads, via persistResults() / the existing
// `import_run_results` RPC, whose exact payload shape was confirmed by
// reading the real "Build Run Payload" node in flytbase-bdr-agent.n8n.json,
// not guessed.
import type { Account, CampaignBrief, Contact, ResearchBrief, RunSummary } from "../agents/types.js";
import { findAccounts } from "../agents/accountAgent.js";
import { evaluateAccount } from "../agents/strategyAgent.js";
import { researchAccount } from "../agents/researchAgent.js";
import { findContacts } from "../agents/contactAgent.js";
import { findEmailForContact } from "../agents/emailFinderAgent.js";
import { writeAndCritiqueEmail } from "../agents/criticAgent.js";
import { createRun, markRunDone, markRunFailed } from "../tools/supabase.js";
import { setMemory, memoryKeys } from "./sharedMemory.js";
import { defaultScheduler } from "./scheduler.js";
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

export async function runCampaign(brief: CampaignBrief, deps: RunCampaignDeps): Promise<RunCampaignResult> {
  const runId = await createRun();
  const scheduler = defaultScheduler((pool, reason) => {
    console.warn(`[scheduler] skipped work on pool "${pool}": ${reason}`);
  });

  const contactsByAccount: Record<string, Contact[]> = {};
  const researchByAccount: Record<string, ResearchBrief> = {};
  const notFoundDetail: { company: string; reason: string }[] = [];
  let emailsGenerated = 0;

  try {
    const accounts = await scheduler.run("openai", () => findAccounts(runId, brief, deps));
    if (!accounts) throw new Error("Account finding was skipped, openai pool exhausted before the run even started.");
    await setMemory(runId, memoryKeys.accounts(), accounts);

    await Promise.all(
      accounts.map(async (account) => {
        const verdict = evaluateAccount(account);
        await setMemory(runId, memoryKeys.strategy(account.id ?? account.company), verdict);
        if (!verdict.pursue) {
          notFoundDetail.push({ company: account.company, reason: `Strategy gate: ${verdict.reason}` });
          return;
        }

        const [research, contacts] = await Promise.all([
          scheduler.run("openai", () => researchAccount(account, deps)),
          scheduler.run("openai", () => findContacts(account, brief, deps)),
        ]);
        if (!research || !contacts) {
          notFoundDetail.push({ company: account.company, reason: "openai pool exhausted during research/contacts" });
          return;
        }
        await setMemory(runId, memoryKeys.research(account.id ?? account.company), research);
        await setMemory(runId, memoryKeys.contacts(account.id ?? account.company), contacts);
        researchByAccount[account.company] = research;

        if (!contacts.length) {
          notFoundDetail.push({ company: account.company, reason: "No role-fitting, sourced contacts found." });
          return;
        }

        const resolvedContacts = await Promise.all(
          contacts.map(async (contact, batchIndex): Promise<Contact> => {
            const resolved = await scheduler.run("prospeo", () => findEmailForContact(contact, account, deps));
            const withEmail = resolved ?? contact;
            if (!withEmail.email) {
              notFoundDetail.push({ company: account.company, reason: `No email resolved for ${contact.name}` });
              return withEmail;
            }

            const draft = await scheduler.run("openai", () =>
              writeAndCritiqueEmail({ account, contact: withEmail, research, batchIndex, deps })
            );
            if (!draft) {
              notFoundDetail.push({ company: account.company, reason: `Email drafting skipped for ${contact.name}, openai pool exhausted` });
              return withEmail;
            }
            await setMemory(runId, memoryKeys.emailDraft(contact.name), draft);
            emailsGenerated += 1;
            return { ...withEmail, draft };
          })
        );
        contactsByAccount[account.company] = resolvedContacts;
      })
    );

    const summary: RunSummary = {
      id: runId,
      status: "done",
      accountsFound: accounts.length,
      emailsGenerated,
      contactsNotFound: notFoundDetail.length,
      contactsNotFoundDetail: notFoundDetail,
      error: null,
    };

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
