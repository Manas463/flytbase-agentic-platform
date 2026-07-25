// Generic dependency-aware executor for agents/plannerAgent.ts's task graph.
// Tasks can be added dynamically mid-run (ctx.addTasks) - that's how account-
// and contact-level tasks get expanded once their parent's real output (the
// actual account list, the actual contact list) becomes known, since those
// counts aren't known until find_accounts/find_contacts actually run.
//
// Uses deferred promises rather than busy-polling, so a task's dependencies
// resolve correctly regardless of what order tasks get registered in -
// scheduling a task before its dependency exists yet is fine, the deferred
// placeholder gets created on first reference and resolved whenever that
// dependency actually runs.
import type { PlannedTask, TaskKind } from "../agents/plannerAgent.js";
import type { Scheduler } from "./scheduler.js";

export interface TaskContext {
  results: Map<string, unknown>;
  addTasks: (tasks: PlannedTask[]) => void;
}

export type TaskExecutor = (task: PlannedTask, ctx: TaskContext) => Promise<unknown>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

function makeDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export async function runTaskGraph(
  initialTasks: PlannedTask[],
  executors: Record<TaskKind, TaskExecutor>,
  scheduler: Scheduler,
  poolByKind: Record<TaskKind, string>
): Promise<Map<string, unknown>> {
  const results = new Map<string, unknown>();
  const deferreds = new Map<string, Deferred<unknown>>();

  function ensure(id: string): Deferred<unknown> {
    let d = deferreds.get(id);
    if (!d) {
      d = makeDeferred<unknown>();
      deferreds.set(id, d);
    }
    return d;
  }

  function schedule(task: PlannedTask): void {
    const d = ensure(task.id);
    void (async () => {
      try {
        await Promise.all(task.dependsOn.map((depId) => ensure(depId).promise));
        const ctx: TaskContext = { results, addTasks: (tasks) => tasks.forEach(schedule) };
        const pool = poolByKind[task.kind];
        const result = await scheduler.run(pool, () => executors[task.kind](task, ctx));
        results.set(task.id, result);
        d!.resolve(result);
      } catch (err) {
        d!.reject(err);
      }
    })();
  }

  initialTasks.forEach(schedule);

  // Drain in waves: dynamically-added tasks (from addTasks) may not exist yet
  // on the first pass, so keep waiting on whatever the current set is until a
  // full wait completes with no new tasks having been added during it.
  for (;;) {
    const current = Array.from(deferreds.values());
    await Promise.allSettled(current.map((d) => d.promise));
    if (deferreds.size === current.length) break;
  }

  return results;
}
