// Ported from "Build Writer Prompt" in the existing n8n pipeline. Structure is
// Sam McKenna's SMYKM ("Show Me You Know Me") method: open with something
// specific and true about THIS account (not a generic industry line), connect
// it to a real mechanism FlytBase has already proven elsewhere, ask a small
// question rather than pushing a CTA. Rotation (angle/subject/transition/
// sender) exists so a batch of emails doesn't read like a mail-merge, each
// pick is deterministic (index-based), not random, so runs stay reproducible.
import type { Account, Contact, ResearchBrief } from "../agents/types.js";
import { pickProof } from "./proofLibrary.js";
import { stripEmDashes } from "../tools/textGuards.js";

export const ANGLES = [
  "safety - keep people out of hazardous or hard-to-reach areas",
  "speed - collapse a multi-day manual process into hours",
  "cost - cut the recurring cost of contracted inspection crews",
  "data quality - get consistent, repeatable measurements manual crews can't match",
  "uptime - catch defects before they cause unplanned downtime",
];

export const SUBJECT_STYLES = [
  "a direct question about their operation",
  "a specific reference to their site or recent news",
  "a short statement of the mechanism, no hype",
  "their company name plus one concrete noun (site, pit, yard, stack)",
];

export const TRANSITIONS = [
  "That's actually why I'm reaching out.",
  "Which is part of why this caught my eye.",
  "That's the exact problem we've been solving for teams like yours.",
  "So I figured it was worth a note.",
];

export const SENDERS = ["Manas", "Lucas", "Marcus", "Priya"];

function pick<T>(arr: T[], index: number): T {
  return arr[((index % arr.length) + arr.length) % arr.length];
}

/** ResearchBrief has no single "summary" field by design, it mirrors the
 * Supabase research table column-for-column, so the writer prompt assembles
 * its own reading view from the structured fields instead. */
function renderResearchSummary(research: ResearchBrief): string {
  const news = research.recentNews.map((n) => `- ${n.date}: ${n.item} (${n.sourceUrl})`).join("\n");
  return [
    `Operational footprint: ${research.operationalFootprint}`,
    `Hazardous / 24-7 context: ${research.hazardAnd247Context}`,
    `Contracted-crew context: ${research.contractedCrewContext}`,
    research.techOrExpansionSignals.length
      ? `Technology / expansion signals: ${research.techOrExpansionSignals.join("; ")}`
      : "",
    news ? `Recent news:\n${news}` : "",
    `Best hook: ${research.bestHook} (source: ${research.bestHookSource})`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildWriterPrompt(opts: {
  account: Account;
  contact: Contact;
  research: ResearchBrief;
  batchIndex: number;
}): string {
  const angle = pick(ANGLES, opts.batchIndex);
  const subjectStyle = pick(SUBJECT_STYLES, opts.batchIndex + 1);
  const transition = pick(TRANSITIONS, opts.batchIndex + 2);
  const sender = pick(SENDERS, opts.batchIndex);
  const researchSummary = renderResearchSummary(opts.research);
  const proof = pickProof(researchSummary);

  return `Write a cold outbound email using the SMYKM method (Show Me You Know Me).

RECIPIENT: ${opts.contact.name}, ${opts.contact.title} at ${opts.account.company}
WHAT WE KNOW ABOUT THEIR OPERATION (use this, don't invent beyond it):
${researchSummary}

STRUCTURE:
1. Open with one specific, true detail about ${opts.account.company}'s actual operation from the research above. Not a generic industry observation.
2. Use this transition into the pitch: "${transition}"
3. Bring in this proof point naturally, adapted to fit, don't paste it verbatim: "${proof.line}" (source: ${proof.name})
4. Frame the value through this angle: ${angle}.
5. Close with ONE small, easy-to-answer question. No "let's hop on a call this week" pressure, no multiple asks.

SUBJECT LINE: write it as ${subjectStyle}, under 8 words, no clickbait.

SENDER NAME: sign the email as "${sender}".

HARD RULES:
- 80 to 150 words in the body, excluding subject and signature.
- No em dashes anywhere, use a period or comma instead.
- No buzzwords: "synergy", "leverage", "revolutionize", "cutting-edge", "game-changer", "seamless".
- No bracketed placeholders like [Company] or [Name], everything must be filled in for real.
- No more than one question mark, no more than one CTA.
- Return exactly in this format:\nSubject: <subject line>\n\n<body>\n\n<sender name>`;
}

/** Deterministic post-processing safety net. Prompt-only em-dash bans proved
 * unreliable in production (the model would drift back after a few emails in
 * a batch), so every draft is regex-scrubbed here regardless of what the
 * model produced. */
export function finalizeEmail(rawText: string): string {
  return stripEmDashes(rawText);
}
