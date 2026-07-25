// The actual orchestrator: wires Planner -> Strategy -> Research/Contacts ->
// Email Finder -> Writer/Critic together, using the Scheduler for concurrency
// and Shared Memory for intermediate persistence per run. This is the
// runtime-layer equivalent of the old n8n canvas's node wiring, expressed as
// code instead of a fixed visual chain, with the Strategy Agent's pursue-gate
// actually skipping downstream work (real dynamic behavior the n8n version
// never had).
//
// NOT YET WIRED: writing final accounts/contacts/emails/research rows into the
// existing production tables that pipeline-review's frontend reads. Those
// exact column names live in pipeline-review/src/integrations/supabase/
// types.ts, which is not available in this codebase, guessing column names
// for a real production insert would risk silently writing wrong data, which
// is exactly the kind of fabrication this whole project exists to prevent.
// Read that file first and fill in `persistResults` below before relying on
// this for a real run; until then, results live in `run_memory` (queryable,
// just not yet shaped for the existing UI) and in the returned RunSummary.
import type { Account, CampaignBrief, Contact, EmailDraft, RunSummary } from "../agents/types.js";
import { findAccounts } from "../agents/accountAgent.js";
import { evaluateAccount } from "../agents/strategyAgent.js";
import { researchAccount } from "../agents/researchAgent.js";
import { findContacts } from "../agents/contactAgent.js";
import { findEmailForContact } from "../agents/emailFinderAgent.js";
import { writeAndCritiqueEmail } from "../agents/criticAgent.js";
import { createRun, markRunDone, markRunFailed } from "../tools/supabase.js";
import { setMemory, memoryKeys } from "./sharedMemory.js";
import { defaultScheduler } from "./scheduler.js";

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
  contactsByAccount: Record<string, Contact[]>;
  emailsByContact: Record<string, EmailDraft>;
}

export async function runCampaign(brief: CampaignBrief, deps: RunCampaignDeps): Promise<RunCampaignResult> {
  const runId = await createRun();
  const scheduler = defaultScheduler((pool, reason) => {
    console.warn(`[scheduler] skipped work on pool "${pool}": ${reason}`);
  });

  const contactsByAccount: Record<string, Contact[]> = {};
  const emailsByContact: Record<string, EmailDraft> = {};
  const notFoundDetail: { company: string; reason: string }[] = [];

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
        contactsByAccount[account.company] = contacts;

        if (!contacts.length) {
          notFoundDetail.push({ company: account.company, reason: "No role-fitting, sourced contacts found." });
          return;
        }

        await Promise.all(
          contacts.map(async (contact, batchIndex) => {
            const resolved = await scheduler.run("prospeo", () => findEmailForContact(contact, account, deps));
            const withEmail = resolved ?? contact;
            if (!withEmail.email) {
              notFoundDetail.push({ company: account.company, reason: `No email resolved for ${contact.name}` });
              return;
            }

            const draft = await scheduler.run("openai", () =>
              writeAndCritiqueEmail({ account, contact: withEmail, research, batchIndex, deps })
            );
            if (!draft) {
              notFoundDetail.push({ company: account.company, reason: `Email drafting skipped for ${contact.name}, openai pool exhausted` });
              return;
            }
            await setMemory(runId, memoryKeys.emailDraft(contact.name), draft);
            emailsByContact[contact.name] = draft;
          })
        );
      })
    );

    const summary: RunSummary = {
      id: runId,
      status: "done",
      accountsFound: accounts.length,
      emailsGenerated: Object.keys(emailsByContact).length,
      contactsNotFound: notFoundDetail.length,
      contactsNotFoundDetail: notFoundDetail,
      error: null,
    };
    await markRunDone(runId, {
      accountsFound: summary.accountsFound,
      emailsGenerated: summary.emailsGenerated,
      contactsNotFound: summary.contactsNotFound,
      contactsNotFoundDetail: notFoundDetail,
    });

    // TODO: persistResults(runId, accounts, contactsByAccount, emailsByContact)
    // once pipeline-review's real column names are available here.

    return { summary, accounts, contactsByAccount, emailsByContact };
  } catch (err) {
    await markRunFailed(runId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
