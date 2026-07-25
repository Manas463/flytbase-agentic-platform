// =============================================================================
// FIRST DRAFT — NEEDS YOUR DESIGN INPUT, NOT A PORT.
// The existing n8n pipeline never had a qualification GATE: Stage 1 scored
// every account against SQM and included the top N, full stop. It never
// rejected an account outright before spending research/contact/email budget
// on it. This Strategy Agent is new behavior the charter calls for but leaves
// undesigned. What's below is a reasonable placeholder (hard-reject on missing
// sources/suppression/geography, soft-reject below an ICP floor), not a
// decision you've actually made. Confirm or change the threshold and the
// reasoning before trusting this in a real run.
// =============================================================================
import type { Account, StrategyVerdict } from "./types.js";

const ICP_FLOOR = 5; // placeholder: below this, don't spend research/contact/email credits

export function evaluateAccount(account: Account): StrategyVerdict {
  if (!account.sources.length) {
    return { accountId: account.id ?? "", pursue: false, reason: "No sourced evidence for this account.", confidence: 1 };
  }
  if (!account.geoOk) {
    return { accountId: account.id ?? "", pursue: false, reason: "Could not confirm Latin American operations.", confidence: 0.9 };
  }
  if (account.icpScore < ICP_FLOOR) {
    return {
      accountId: account.id ?? "",
      pursue: false,
      reason: `ICP score ${account.icpScore} is below the placeholder floor of ${ICP_FLOOR}.`,
      confidence: 0.6,
    };
  }
  return {
    accountId: account.id ?? "",
    pursue: true,
    reason: `Sourced, confirmed LATAM operations, ICP score ${account.icpScore}.`,
    confidence: 0.7,
  };
}
