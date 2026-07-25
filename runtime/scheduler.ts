// Rate/credit-aware task scheduler for the Planner's dynamic task graph.
// Two real constraints from the existing system, both free-tier: OpenAI calls
// cost money per token, and Prospeo/Hunter have hard monthly credit caps (this
// is exactly why the email-finder waterfall is ordered Prospeo-then-Hunter:
// Prospeo has more free credits per month). A dynamic graph makes it easy to
// accidentally blow through those caps by over-parallelizing; this scheduler
// enforces a concurrency cap per named resource pool and a hard call-budget
// per pool, refusing (not silently dropping) work once a pool is exhausted.
export interface PoolLimits {
  concurrency: number;
  maxCalls?: number; // omit for no hard cap (e.g. Supabase reads/writes)
}

export interface SchedulerOptions {
  pools: Record<string, PoolLimits>;
  onSkip?: (pool: string, reason: string) => void;
}

interface PoolState extends PoolLimits {
  inFlight: number;
  callsUsed: number;
  queue: (() => void)[];
}

export class Scheduler {
  private pools = new Map<string, PoolState>();
  private onSkip?: (pool: string, reason: string) => void;

  constructor(opts: SchedulerOptions) {
    this.onSkip = opts.onSkip;
    for (const [name, limits] of Object.entries(opts.pools)) {
      this.pools.set(name, { ...limits, inFlight: 0, callsUsed: 0, queue: [] });
    }
  }

  private acquire(poolName: string): Promise<void> {
    const pool = this.pools.get(poolName);
    if (!pool) throw new Error(`Unknown resource pool: ${poolName}`);
    return new Promise((resolve) => {
      const tryEnter = () => {
        if (pool.inFlight < pool.concurrency) {
          pool.inFlight += 1;
          resolve();
        } else {
          pool.queue.push(tryEnter);
        }
      };
      tryEnter();
    });
  }

  private release(poolName: string): void {
    const pool = this.pools.get(poolName)!;
    pool.inFlight -= 1;
    const next = pool.queue.shift();
    if (next) next();
  }

  /** Runs `fn` under `poolName`'s concurrency/credit limits. Returns null (and
   * calls onSkip) instead of throwing when the pool's hard call budget is
   * already exhausted, so a caller can honestly record "not attempted, budget
   * exhausted" rather than crash the whole run over one exhausted provider. */
  async run<T>(poolName: string, fn: () => Promise<T>): Promise<T | null> {
    const pool = this.pools.get(poolName);
    if (!pool) throw new Error(`Unknown resource pool: ${poolName}`);
    if (pool.maxCalls != null && pool.callsUsed >= pool.maxCalls) {
      this.onSkip?.(poolName, `call budget of ${pool.maxCalls} exhausted`);
      return null;
    }
    await this.acquire(poolName);
    pool.callsUsed += 1;
    try {
      return await fn();
    } finally {
      this.release(poolName);
    }
  }

  usage(poolName: string): { inFlight: number; callsUsed: number; maxCalls?: number } {
    const pool = this.pools.get(poolName)!;
    return { inFlight: pool.inFlight, callsUsed: pool.callsUsed, maxCalls: pool.maxCalls };
  }
}

/** Sensible starting pools; tune maxCalls to your actual plan tiers before a
 * real run. openai has no hard cap here (billed, not credit-limited), the
 * others reflect real free-tier constraints from the existing pipeline. */
export function defaultScheduler(onSkip?: (pool: string, reason: string) => void): Scheduler {
  return new Scheduler({
    onSkip,
    pools: {
      openai: { concurrency: 5 },
      tavily: { concurrency: 3 },
      prospeo: { concurrency: 2, maxCalls: 75 },
      hunter: { concurrency: 2, maxCalls: 50 },
      supabase: { concurrency: 10 },
    },
  });
}
