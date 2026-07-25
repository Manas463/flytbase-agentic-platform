// This is now actually wired into runtime/runCampaign.ts via
// runtime/taskGraphExecutor.ts, it's no longer dead code sitting next to the
// real hand-coded orchestration. What's still true from the original "first
// draft" note: the SHAPE this graph produces per run is basically the same
// fixed chain the n8n canvas had (account -> strategy gate -> research +
// contacts -> per-contact email-finder -> write+critique), just expressed as
// data and actually driving execution instead of a static visual layout.
// Strategy can now expand the graph from observed mid-run evidence gaps. The
// expansion is deliberately bounded to one retry so adaptation cannot turn
// into an uncontrolled credit-spending loop.
//
// Account and contact counts aren't known when the graph is first built, they
// only exist after find_accounts / find_contacts actually run, so those
// levels are expanded dynamically via ctx.addTasks() mid-execution (see
// runtime/taskGraphExecutor.ts), the same pattern for both levels.
export type TaskKind =
  | "find_accounts"
  | "research_account"
  | "find_contacts"
  | "evaluate_strategy"
  | "research_strategy_gaps"
  | "search_strategy_contacts"
  | "find_email"
  | "write_and_critique_email"; // one atomic call (agents/criticAgent.ts), matches the real code, not two separate steps

export interface PlannedTask {
  id: string;
  kind: TaskKind;
  accountKey?: string;
  contactIndex?: number;
  attempt?: number;
  dependsOn: string[];
}

export function buildTaskGraph(): PlannedTask[] {
  return [{ id: "find_accounts", kind: "find_accounts", dependsOn: [] }];
}

/** Initial research and contact discovery run in parallel. Strategy consumes
 * both from Shared Memory, then decides whether to pursue, reject, or create
 * targeted evidence-gap tasks. */
export function expandAccountTasks(accountKeys: string[]): PlannedTask[] {
  const tasks: PlannedTask[] = [];
  for (const key of accountKeys) {
    const researchId = `research:${key}`;
    const contactsId = `contacts:${key}`;
    tasks.push(
      { id: researchId, kind: "research_account", accountKey: key, dependsOn: ["find_accounts"] },
      { id: contactsId, kind: "find_contacts", accountKey: key, dependsOn: ["find_accounts"] },
      {
        id: `strategy:${key}:0`,
        kind: "evaluate_strategy",
        accountKey: key,
        attempt: 0,
        dependsOn: [researchId, contactsId],
      }
    );
  }
  return tasks;
}

export function expandStrategyRetryTasks(
  accountKey: string,
  nextAttempt: number,
  owners: Array<"research_agent" | "contact_agent">
): PlannedTask[] {
  const previousStrategyId = `strategy:${accountKey}:${nextAttempt - 1}`;
  const dependencies: string[] = [];
  const tasks: PlannedTask[] = [];
  if (owners.includes("research_agent")) {
    const id = `strategy_research:${accountKey}:${nextAttempt}`;
    tasks.push({ id, kind: "research_strategy_gaps", accountKey, attempt: nextAttempt, dependsOn: [previousStrategyId] });
    dependencies.push(id);
  }
  if (owners.includes("contact_agent")) {
    const id = `strategy_contacts:${accountKey}:${nextAttempt}`;
    tasks.push({ id, kind: "search_strategy_contacts", accountKey, attempt: nextAttempt, dependsOn: [previousStrategyId] });
    dependencies.push(id);
  }
  tasks.push({
    id: `strategy:${accountKey}:${nextAttempt}`,
    kind: "evaluate_strategy",
    accountKey,
    attempt: nextAttempt,
    dependsOn: dependencies.length ? dependencies : [previousStrategyId],
  });
  return tasks;
}

/** Called once find_contacts resolves for one account, with the real contact
 * count now known. Uses an index rather than contact name as the task key,
 * names collide across accounts (common in LATAM mining, e.g. duplicate
 * "Carlos Rodriguez"s), an index scoped to (accountKey) never does. */
export function expandContactTasks(
  accountKey: string,
  contactCount: number,
  strategyDependency: string
): PlannedTask[] {
  const contactsId = `contacts:${accountKey}`;
  const researchId = `research:${accountKey}`;
  const tasks: PlannedTask[] = [];
  for (let i = 0; i < contactCount; i++) {
    const emailFinderId = `email_finder:${accountKey}::${i}`;
    tasks.push(
      { id: emailFinderId, kind: "find_email", accountKey, contactIndex: i, dependsOn: [contactsId, strategyDependency] },
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
