// The cross-run feedback loop: aggregates real patterns from run history
// (critic failures, strategy-gate rejections, email-not-found reasons) into a
// human-readable report. Deliberately NOT a self-modifying loop, it doesn't
// touch skills/emailWriting.ts, skills/critic.ts, or agents/strategyAgent.ts
// itself. Letting the model rewrite its own prompts/logic automatically is
// exactly the failure mode this whole project has hardened against (the
// em-dash leak and the suppression-list leak both happened because
// prompt-only / model-only enforcement was trusted instead of a human or
// deterministic code check). This module surfaces what's actually
// happening, a human decides what to change.
//
// Per-run diagnostic detail (critic failures, strategy verdicts) only lives
// in run_memory, not the production tables (those only keep the coarse
// "passed" / "passed_after_rewrite" label for the frontend), so this reads
// from run_memory across the last N completed runs.
import { getSupabase } from "../tools/supabase.js";
import { getMemory, listMemoryKeys } from "./sharedMemory.js";
import type { EmailDraft, StrategyVerdict } from "../agents/types.js";

export interface FrequencyEntry {
  value: string;
  count: number;
}

export interface RunAnalyticsReport {
  runsAnalyzed: number;
  emailsAnalyzed: number;
  firstTryPassRate: number;
  rewriteRate: number;
  failureFrequency: FrequencyEntry[];
  failureCategoryCounts: Record<string, number>;
  strategyRejectReasons: FrequencyEntry[];
  strategyGapFrequency: FrequencyEntry[];
  strategyRetryStats: {
    accountsRetried: number;
    pursuedAfterRetry: number;
    rejectedAfterRetry: number;
  };
  notFoundReasons: FrequencyEntry[];
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  word_count: ["word", "80", "150", "length", "concise"],
  em_dash: ["em dash", "dash"],
  buzzword: ["buzzword", "synergy", "leverage", "cutting-edge", "game-changer", "seamless", "revolutionize"],
  placeholder: ["placeholder", "bracket"],
  generic_opener: ["generic", "specific", "detail"],
  cta_question: ["question", "cta", "call to action", "call-to-action"],
  proof_point: ["proof", "mechanism", "vague"],
  fabrication: ["fabricat", "invent", "overstate", "beyond the supplied"],
};

function categorize(failure: string): string {
  const lower = failure.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return "other";
}

function countFrequency(items: string[]): FrequencyEntry[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/** Strips the specific name out of "No email resolved for X" so all such
 * reasons bucket together instead of each being its own unique-count-1 line. */
function normalizeNotFoundReason(reason: string): string {
  return reason.replace(/for .+$/, "for <contact>");
}

export async function analyzeRecentRuns(limit = 10): Promise<RunAnalyticsReport> {
  const { data: runs, error } = await getSupabase()
    .from("runs")
    .select("id, contacts_not_found_detail")
    .eq("status", "done")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const drafts: EmailDraft[] = [];
  const strategyRejectReasonsRaw: string[] = [];
  const strategyGapsRaw: string[] = [];
  const retriedAccounts = new Set<string>();
  let pursuedAfterRetry = 0;
  let rejectedAfterRetry = 0;
  const notFoundReasonsRaw: string[] = [];

  for (const run of runs ?? []) {
    const draftKeys = await listMemoryKeys(run.id, "email_draft:");
    for (const key of draftKeys) {
      const draft = await getMemory<EmailDraft>(run.id, key);
      if (draft) drafts.push(draft);
    }

    const strategyKeys = await listMemoryKeys(run.id, "strategy:");
    for (const key of strategyKeys) {
      const verdict = await getMemory<StrategyVerdict>(run.id, key);
      if (!verdict) continue;
      if (!verdict.pursue) strategyRejectReasonsRaw.push(verdict.reason);
      if (verdict.attempt > 0) {
        retriedAccounts.add(`${run.id}:${verdict.accountId}`);
        if (verdict.status === "pursue") pursuedAfterRetry += 1;
        if (verdict.status === "reject") rejectedAfterRetry += 1;
      }
    }

    const attemptKeys = await listMemoryKeys(run.id, "strategy_attempt:");
    for (const key of attemptKeys) {
      const verdict = await getMemory<StrategyVerdict>(run.id, key);
      if (verdict?.status === "needs_more_research") {
        strategyGapsRaw.push(...verdict.gaps.map((gap) => gap.id));
      }
    }

    const detail = (run.contacts_not_found_detail as { reason: string }[] | null) ?? [];
    for (const d of detail) notFoundReasonsRaw.push(normalizeNotFoundReason(d.reason));
  }

  const allFailures = drafts.flatMap((d) => d.criticVerdict?.failures ?? []);
  const failureCategoryCounts: Record<string, number> = {};
  for (const failure of allFailures) {
    const category = categorize(failure);
    failureCategoryCounts[category] = (failureCategoryCounts[category] ?? 0) + 1;
  }

  const firstTryCount = drafts.filter((d) => !d.rewrittenAfterCritic).length;
  const rewrittenCount = drafts.filter((d) => d.rewrittenAfterCritic).length;

  return {
    runsAnalyzed: runs?.length ?? 0,
    emailsAnalyzed: drafts.length,
    firstTryPassRate: drafts.length ? firstTryCount / drafts.length : 0,
    rewriteRate: drafts.length ? rewrittenCount / drafts.length : 0,
    failureFrequency: countFrequency(allFailures),
    failureCategoryCounts,
    strategyRejectReasons: countFrequency(strategyRejectReasonsRaw),
    strategyGapFrequency: countFrequency(strategyGapsRaw),
    strategyRetryStats: {
      accountsRetried: retriedAccounts.size,
      pursuedAfterRetry,
      rejectedAfterRetry,
    },
    notFoundReasons: countFrequency(notFoundReasonsRaw),
  };
}
