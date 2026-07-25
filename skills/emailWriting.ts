// Ported from "Build Writer Prompt" in the existing n8n pipeline. Structure is
// Sam McKenna's SMYKM ("Show Me You Know Me") method: open with something
// specific and true about THIS account (not a generic industry line), connect
// it to a real mechanism FlytBase has already proven elsewhere. Rotation
// (angle/subject/transition/sender) exists so a batch of emails doesn't read
// like a mail-merge, each pick is deterministic (index-based), not random, so
// runs stay reproducible.
//
// The closing ask was originally a soft, low-pressure question (no hard CTA).
// That was a deliberate choice at the time. Manas later asked for it to be a
// clear, direct call-to-action instead, since the assignment's actual goal is
// "book discovery calls" and a soft question doesn't move toward that goal on
// its own. CALENDLY_LINK is real (verified live, not a placeholder) and gets
// used as the literal booking destination.
import type { Account, Contact, ResearchBrief } from "../agents/types.js";
import { pickProof } from "./proofLibrary.js";
import { stripEmDashes } from "../tools/textGuards.js";

export const CALENDLY_LINK = "https://calendly.com/manas463jaiswal/30min";

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
4. Lead with this angle: ${angle} - but ground it in what the research above actually says about ${opts.account.company}'s real challenges. If their specific situation genuinely calls for a second, closely-related angle, it's fine to touch on it too; don't bolt on unrelated benefits just to sound comprehensive, and don't force a single angle if it doesn't fit what you actually know about this account.
5. Close with ONE clear call-to-action: invite them to grab 30 minutes on the calendar at ${CALENDLY_LINK}. Phrase it naturally (e.g. "If it'd be useful to compare notes, grab 30 minutes here: ${CALENDLY_LINK}"), don't just paste the link with no lead-in, and don't stack it with a second ask.

SUBJECT LINE: write it as ${subjectStyle}, under 8 words, no clickbait.

SENDER NAME: sign the email as "${sender}".

HARD RULES:
- Aim for roughly 80 to 150 words in the body, excluding subject and signature. This is a target, not a hard boundary - a little over or under is fine, don't pad or chop content just to hit an exact count.
- No em dashes anywhere, use a period or comma instead.
- No buzzwords: "synergy", "leverage", "revolutionize", "cutting-edge", "game-changer", "seamless".
- No bracketed placeholders like [Company] or [Name] or [calendar link], everything must be filled in for real, including the actual calendar URL above.
- Exactly one CTA, exactly one link.
- Return exactly in this format:\nSubject: <subject line>\n\n<body>\n\n<sender name>`;
}

/** Deterministic post-processing safety net. Prompt-only em-dash bans proved
 * unreliable in production (the model would drift back after a few emails in
 * a batch), so every draft is regex-scrubbed here regardless of what the
 * model produced. */
export function finalizeEmail(rawText: string): string {
  return stripEmDashes(rawText);
}
