// This is now actually wired into runtime/runCampaign.ts via
// runtime/taskGraphExecutor.ts, it's no longer dead code sitting next to the
// real hand-coded orchestration. What's still true from the original "first
// draft" note: the SHAPE this graph produces per run is basically the same
// fixed chain the n8n canvas had (account -> strategy gate -> research +
// contacts -> per-contact email-finder -> write+critique), just expressed as
// data and actually driving execution instead of a static visual layout.
// Real dynamic scheduling beyond that (e.g. reprioritizing based on mid-run
// signals, not just a fixed shape gated by the Strategy Agent) is still not
// built, don't oversell this as smarter than it is.
//
// Account and contact counts aren't known when the graph is first built, they
// only exist after find_accounts / find_contacts actually run, so those
// levels are expanded dynamically via ctx.addTasks() mid-execution (see
// runtime/taskGraphExecutor.ts), the same pattern for both levels.
export type TaskKind =
  | "find_accounts"
  | "evaluate_strategy"
  | "research_account"
  | "find_contacts"
  | "find_email"
  | "write_and_critique_email"; // one atomic call (agents/criticAgent.ts), matches the real code, not two separate steps

export interface PlannedTask {
  id: string;
  kind: TaskKind;
  accountKey?: string;
  contactIndex?: number;
  dependsOn: string[];
}

export function buildTaskGraph(): PlannedTask[] {
  return [{ id: "find_accounts", kind: "find_accounts", dependsOn: [] }];
}

/** Called once find_accounts resolves, with the real account keys (company
 * names) now known. Each account gets a strategy gate, then research and
 * contact-finding depending on that gate (both still get SCHEDULED even if
 * the gate rejects the account, their executors check the verdict and no-op
 * rather than the graph itself pruning the branch, keeping the graph shape
 * simple and the gating logic in one place). */
export function expandAccountTasks(accountKeys: string[]): PlannedTask[] {
  const tasks: PlannedTask[] = [];
  for (const key of accountKeys) {
    const strategyId = `strategy:${key}`;
    tasks.push(
      { id: strategyId, kind: "evaluate_strategy", accountKey: key, dependsOn: ["find_accounts"] },
      { id: `research:${key}`, kind: "research_account", accountKey: key, dependsOn: [strategyId] },
      { id: `contacts:${key}`, kind: "find_contacts", accountKey: key, dependsOn: [strategyId] }
    );
  }
  return tasks;
}

/** Called once find_contacts resolves for one account, with the real contact
 * count now known. Uses an index rather than contact name as the task key,
 * names collide across accounts (common in LATAM mining, e.g. duplicate
 * "Carlos Rodriguez"s), an index scoped to (accountKey) never does. */
export function expandContactTasks(accountKey: string, contactCount: number): PlannedTask[] {
  const contactsId = `contacts:${accountKey}`;
  const researchId = `research:${accountKey}`;
  const tasks: PlannedTask[] = [];
  for (let i = 0; i < contactCount; i++) {
    const emailFinderId = `email_finder:${accountKey}::${i}`;
    tasks.push(
      { id: emailFinderId, kind: "find_email", accountKey, contactIndex: i, dependsOn: [contactsId] },
      {
        id: `write_email:${accountKey}::${i}`,
        kind: "write_and_critique_email",
        accountKey,
        contactIndex: i,
        dependsOn: [emailFinderId, researchId],
      }
    );
  }
  return tasks;
}
