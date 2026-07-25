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
  "The value angle(s) are genuinely grounded in this account's actual challenges from the research, not a generic list of unrelated benefits bolted on for the sake of sounding comprehensive - mentioning more than one angle is fine if the research actually supports it for this account",
  "Body length is reasonable, roughly 80-150 words - do not fail for being modestly over or under that range, only flag if it's clearly too thin to say anything real or rambling on too long",
  "Contains zero em dashes",
  "Contains zero buzzwords (synergy, leverage, revolutionize, cutting-edge, game-changer, seamless)",
  "Contains zero bracketed placeholders, including a placeholder calendar link - the real Calendly URL must actually appear",
  "Ends with exactly one clear call-to-action inviting them to book 30 minutes on the calendar, with the real link included and naturally introduced, not just pasted",
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
