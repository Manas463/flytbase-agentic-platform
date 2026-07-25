// Shared campaign brief so runtime/cli.ts (manual runs) and backend/server.ts
// (triggered from the frontend) build the exact same brief instead of two
// copies drifting apart. `vertical` and `anchor` are overridable from the
// frontend's trigger form, everything else (goal, role families, proof
// customers, suppression) stays fixed.
import type { CampaignBrief } from "../agents/types.js";

export function buildDefaultBrief(
  overrides: Partial<Pick<CampaignBrief, "vertical" | "anchor">> = {}
): CampaignBrief {
  return {
    vertical: overrides.vertical?.trim() || "large-scale lithium, copper, and iron-ore mining in Latin America",
    anchor: overrides.anchor?.trim() || "Sociedad Quimica y Minera de Chile (SQM)",
    goal: "book qualified discovery calls for FlytBase's autonomous drone-in-a-box inspection platform",
    angle: "replace manual/contracted inspection crews in hazardous, 24/7 mining operations with autonomous drone inspection",
    maxAccounts: 8,
    contactsPerAccount: 2,
    targetTitles: [
      "Head of Operations / VP Operations / Gerente de Operaciones",
      "VP HSE / Head of HSE / Gerente HSE",
      "Site Director / Site General Manager / Gerente General de Faena",
      "Digital Transformation Lead / Head of Innovation / CTO / Gerente de Transformacion Digital",
    ],
    proofCustomers: ["Anglo American", "SQM", "CSX", "Shell"],
    suppression: ["Anglo American", "SQM", "CSX", "Shell"],
    senderName: "Manas",
    senderTitle: "Business Development Representative, FlytBase",
  };
}
