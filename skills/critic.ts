// Ported from "Build Critic Prompt" / "Build Rewrite Prompt" in the existing
// n8n pipeline. The critic is a second, independent model call scoring the
// drafted email against an 11-point SMYKM checklist; anything that fails
// triggers a rewrite pass that reuses the ORIGINAL writer prompt verbatim plus
// the specific failures appended, rather than a fresh prompt, so the rewrite
// stays anchored to the same account/contact/proof-point facts.
export const CRITIC_CHECKLIST = [
  "Opens with a specific, verifiable detail about THIS account, not a generic industry statement",
  "Does not fabricate or overstate any fact beyond the supplied research",
  "Transitions naturally into the pitch rather than an abrupt topic jump",
  "Uses a real, specific proof point (named company, named mechanism), not a vague claim",
  "Value angle is clear and singular, not a list of multiple benefits",
  "Body is 80 to 150 words",
  "Contains zero em dashes",
  "Contains zero buzzwords (synergy, leverage, revolutionize, cutting-edge, game-changer, seamless)",
  "Contains zero bracketed placeholders",
  "Ends with exactly one small, low-pressure question, not a hard CTA",
  "Reads like a real person wrote it, not a template",
] as const;

export const CRITIC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pass", "failures"],
  properties: {
    pass: { type: "boolean" },
    failures: { type: "array", items: { type: "string" } },
  },
} as const;

export function buildCriticPrompt(emailText: string): string {
  return `Score this cold email against every item on the checklist below. Set pass=true only if EVERY item passes. For each item that fails, add one specific, actionable failure description to "failures" (empty array if pass=true).\n\nCHECKLIST:\n${CRITIC_CHECKLIST.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nEMAIL:\n${emailText}`;
}

/** Reuses the exact prompt that produced the original draft, plus the critic's
 * failures appended. Deliberately NOT a fresh prompt: the rewrite must still
 * be anchored to the same account, contact, and proof-point facts, only the
 * specific failures need fixing. */
export function buildRewritePrompt(originalWriterPrompt: string, failures: string[]): string {
  return `${originalWriterPrompt}\n\nYour previous draft failed review for these specific reasons, fix ALL of them in this rewrite:\n${failures.map((f) => `- ${f}`).join("\n")}`;
}
