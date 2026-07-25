// =============================================================================
// FIRST DRAFT — NEEDS YOUR DESIGN INPUT, NOT A PORT.
// The only existing precedent for this is the single critic-to-rewrite pass
// on emails (agents/criticAgent.ts): one retry, then ship regardless of the
// outcome. The charter calls for a GENERAL reflection layer across every
// stage (accounts, research, contacts, emails), with a confidence score and a
// retry decision. Generalizing "one email failed 3 of 11 checklist items" into
// "this account's research came back thin" or "we only found 1 of 3 requested
// contacts" is a real design problem (what counts as low confidence per stage?
// how many retries before giving up and marking not-found honestly, matching
// the anti-fabrication principle rather than inventing filler?). What's below
// is a placeholder shape, not a tuned policy.
// =============================================================================
import type { ReflectionEntry } from "./types.js";

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
