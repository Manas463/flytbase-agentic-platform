// Generic count-based reflection remains available for simple stages. Strategy
// uses the richer criterion-aware reflection below so its retries address
// named evidence gaps rather than repeating the same broad search.
import type { ReflectionEntry, StrategyVerdict } from "./types.js";

export interface StageResult {
  stage: string;
  itemCount: number;
  expectedCount: number;
  failures: string[];
}

const MAX_RETRIES_PER_STAGE = 1; // placeholder, mirrors the one existing critic->rewrite precedent

export function reflect(result: StageResult, attemptsSoFar: number): ReflectionEntry {
  const completeness = result.expectedCount > 0 ? result.itemCount / result.expectedCount : 1;
  const confidence = Math.max(0, completeness - result.failures.length * 0.1);
  const retryRecommended = confidence < 0.7 && attemptsSoFar < MAX_RETRIES_PER_STAGE;

  return {
    stage: result.stage,
    confidence,
    failures: result.failures,
    suggestions: retryRecommended
      ? [`Retry ${result.stage}: only ${result.itemCount}/${result.expectedCount} items, confidence ${confidence.toFixed(2)}.`]
      : completeness < 1
        ? [`Accept partial result for ${result.stage} honestly (${result.itemCount}/${result.expectedCount}); do not fabricate the rest.`]
        : [],
    retryRecommended,
  };
}

/** Converts an explainable Strategy verdict into Planner feedback. This is a
 * learning loop in the operational sense: observe missing evidence, create
 * targeted work, retry once, and retain the outcome. It never lets an LLM
 * rewrite its own scorecard or guardrails. */
export function reflectOnStrategy(verdict: StrategyVerdict): ReflectionEntry {
  const retryRecommended = verdict.status === "needs_more_research" && !verdict.terminal;
  return {
    stage: "strategy",
    accountId: verdict.accountId,
    attempt: verdict.attempt,
    confidence: verdict.confidence,
    failures: verdict.gaps.map((gap) => gap.description),
    suggestions: retryRecommended
      ? verdict.gaps.map((gap) => `${gap.owner}: ${gap.researchQuestion}`)
      : verdict.status === "reject"
        ? [`Stop spending credits on this account: ${verdict.reason}`]
        : ["Qualification passed; continue to email resolution and writing."],
    retryRecommended,
    gapIds: verdict.gaps.map((gap) => gap.id),
  };
}
