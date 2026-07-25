// =============================================================================
// FIRST DRAFT — NEEDS YOUR DESIGN INPUT, NOT A PORT.
// The existing n8n pipeline's "task graph" was implicit and static: a fixed
// chain of nodes (Build Brief -> Finder -> Research -> Contacts -> Email
// Finder -> Writer -> Critic -> Assemble), the same shape every run. The
// charter calls for a Planner that builds a DYNAMIC task graph per run, e.g.
// skip research for accounts the Strategy Agent rejects, parallelize account
// research across accounts, throttle to Prospeo/Hunter/OpenAI rate and credit
// limits. What's below is a straightforward per-account DAG (the same fixed
// shape as before, just expressed as data instead of n8n nodes) with a
// pursue-gate branch, NOT the smarter dynamic scheduling the charter
// describes. Treat this as the skeleton to negotiate the real planning logic
// onto, not the finished planner.
// =============================================================================
export type TaskKind =
  | "find_accounts"
  | "evaluate_strategy"
  | "research_account"
  | "find_contacts"
  | "find_email"
  | "write_email"
  | "critique_email";

export interface PlannedTask {
  id: string;
  kind: TaskKind;
  accountId?: string;
  contactId?: string;
  dependsOn: string[];
}

/** Builds one straight-line chain per account, gated by the Strategy Agent's
 * verdict for that account (research/contacts/emails only run if pursue=true).
 * All account chains are independent of each other, so a scheduler is free to
 * run them concurrently up to whatever rate/credit limit it enforces. */
export function buildTaskGraph(accountIds: string[]): PlannedTask[] {
  const tasks: PlannedTask[] = [{ id: "find_accounts", kind: "find_accounts", dependsOn: [] }];

  for (const accountId of accountIds) {
    const strategyId = `strategy:${accountId}`;
    const researchId = `research:${accountId}`;
    const contactsId = `contacts:${accountId}`;

    tasks.push(
      { id: strategyId, kind: "evaluate_strategy", accountId, dependsOn: ["find_accounts"] },
      { id: researchId, kind: "research_account", accountId, dependsOn: [strategyId] },
      { id: contactsId, kind: "find_contacts", accountId, dependsOn: [strategyId] }
    );
    // Per-contact email/email-finder tasks are appended once find_contacts
    // resolves and actual contact IDs exist; the scheduler is expected to
    // expand these dynamically rather than the planner guessing contact
    // counts up front.
  }

  return tasks;
}

export function expandContactTasks(accountId: string, contactIds: string[]): PlannedTask[] {
  const contactsId = `contacts:${accountId}`;
  const researchId = `research:${accountId}`;
  return contactIds.flatMap((contactId) => {
    const emailFinderId = `email_finder:${contactId}`;
    const writeId = `write_email:${contactId}`;
    const critiqueId = `critique_email:${contactId}`;
    return [
      { id: emailFinderId, kind: "find_email" as const, accountId, contactId, dependsOn: [contactsId] },
      { id: writeId, kind: "write_email" as const, accountId, contactId, dependsOn: [contactsId, researchId] },
      { id: critiqueId, kind: "critique_email" as const, accountId, contactId, dependsOn: [writeId] },
    ];
  });
}
