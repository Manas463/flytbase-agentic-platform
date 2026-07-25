// Follow-up sequence templates, adapted from Manas's real cold-email-sequence
// templates (Follow Up Email #1 / #2, plus a final light "does it still make
// sense" touch). Each follow-up stays anchored to the SAME account/contact/
// research/mechanism as the cold email, it never invents a new angle, it just
// re-approaches the same real value with a different tone: a plain follow-up,
// a check-in, then a final low-pressure nudge. All three end on the same real
// Calendly link, never a placeholder.
import type { Account, Contact, ResearchBrief } from "../agents/types.js";
import { CALENDLY_LINK } from "./emailWriting.js";

export interface FollowUpContext {
  account: Account;
  contact: Contact;
  research: ResearchBrief;
  senderName: string; // MUST match the cold email's sender - same thread, same person
  coldEmailSubject: string;
  coldEmailBody: string;
  mechanism: string; // the proof/mechanism used in the cold email, kept consistent
}

const HARD_RULES = `HARD RULES:
- Aim for roughly 40 to 90 words, shorter than the original cold email, follow-ups are brief.
- No em dashes, no buzzwords ("synergy", "leverage", "revolutionize", "cutting-edge", "game-changer", "seamless").
- No bracketed placeholders of any kind, including for the calendar link - use the real URL given below.
- Exactly one CTA, exactly one link.
- Same sender as before, do not introduce yourself again or re-explain who you are at length.
- Return exactly in this format:\nSubject: <subject line>\n\n<body>\n\n<sender name>`;

function contextBlock(ctx: FollowUpContext): string {
  return `RECIPIENT: ${ctx.contact.name}, ${ctx.contact.title} at ${ctx.account.company}
SENDER: ${ctx.senderName}
CALENDAR LINK (use exactly this): ${CALENDLY_LINK}
ORIGINAL COLD EMAIL (this is a follow-up to it, don't repeat it, build on it):
Subject: ${ctx.coldEmailSubject}
${ctx.coldEmailBody}
THE REAL MECHANISM/VALUE THIS THREAD IS ABOUT: ${ctx.mechanism}`;
}

/** Follow-up 1: a plain, simple follow-up. Real template: "I wanted to follow
 * up to see if it still makes sense to talk about how we can help you with
 * X by doing Y. So if it still makes sense to talk, go ahead and schedule a
 * time on my calendar here." */
export function buildFollowUp1Prompt(ctx: FollowUpContext): string {
  return `Write follow-up email #1 in a cold outbound sequence, based on this real template:

"Hey [Name], I wanted to follow up to see if it still makes sense to talk about how we can help you with [value] by doing [mechanism]. So if it still makes sense to talk, go ahead and schedule a time to talk on my calendar here [link]. Thanks, [sender]"

Fill it with the REAL value and mechanism from this specific thread, not the bracketed placeholders above, those are just showing you the shape.

${contextBlock(ctx)}

${HARD_RULES}`;
}

/** Follow-up 2: a check-in. Real template: "Hope you're doing well. Now, I'm
 * checking in with you to see if you were still interested in X with Y. If it
 * still makes sense to talk, you can schedule a time on my calendar here. But
 * if none of these times work for you, let me know what does." */
export function buildFollowUp2Prompt(ctx: FollowUpContext): string {
  return `Write follow-up email #2 in a cold outbound sequence (this is the SECOND follow-up, after #1 got no reply), based on this real template:

"Hi [Name], Hope you're doing well. Now, I'm checking in with you to see if you were still interested in [outcome] with [mechanism]. If it still makes sense to talk, you can schedule a time to talk on my calendar here. But if none of these times work for you, let me know what does and I'll do what I can to make it work. Thanks, [sender]"

Fill it with the REAL outcome and mechanism from this specific thread, not the bracketed placeholders above, those just show the shape. Keep the "let me know what does" flexibility line, it's a real and useful low-pressure touch.

${contextBlock(ctx)}

${HARD_RULES}`;
}

/** Follow-up 3 (final): per Manas - "something similar like the first two,
 * spin around a bit, if it still makes sense to talk or something like
 * that." A light, final low-pressure nudge, not a hard breakup email. */
export function buildFollowUp3Prompt(ctx: FollowUpContext): string {
  return `Write follow-up email #3, the FINAL touch in this cold outbound sequence (after #1 and #2 got no reply). Keep the same low-pressure spirit as the first two follow-ups, just a light final spin on "does it still make sense to talk", not a hard breakup email, not guilt-tripping, not "this is my last email." A natural, brief final check-in that still ends on the same real calendar link.

${contextBlock(ctx)}

${HARD_RULES}`;
}

export function buildFollowUpPrompt(sequenceIndex: 1 | 2 | 3, ctx: FollowUpContext): string {
  if (sequenceIndex === 1) return buildFollowUp1Prompt(ctx);
  if (sequenceIndex === 2) return buildFollowUp2Prompt(ctx);
  return buildFollowUp3Prompt(ctx);
}
