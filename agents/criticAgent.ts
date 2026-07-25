// Ported from "Build Critic Prompt" + the single critic-to-rewrite pass in the
// existing n8n pipeline. Exactly one rewrite attempt, never a loop: if the
// rewrite still fails, the email ships with criticVerdict.passed=false and
// rewrittenAfterCritic=true so a human can see it was flagged, rather than
// spending unlimited model calls chasing a perfect score.
import type { Account, Contact, EmailDraft, ResearchBrief } from "./types.js";
import { structuredCall, freeTextCall } from "../tools/openai.js";
import { buildCriticPrompt, buildRewritePrompt, CRITIC_SCHEMA } from "../skills/critic.js";
import { pickProof } from "../skills/proofLibrary.js";
import {
  writeEmail,
  rewriteEmail,
  writeFollowUp,
  parseDraft,
  type WriterAgentDeps,
  type DraftedEmail,
} from "./writerAgent.js";
import type { FollowUpContext } from "../skills/followUpWriting.js";

interface CriticVerdict {
  pass: boolean;
  failures: string[];
}

async function critique(emailText: string, deps: WriterAgentDeps): Promise<CriticVerdict> {
  const verdict = await structuredCall<CriticVerdict>({
    apiKey: deps.openaiApiKey,
    model: deps.model,
    input: buildCriticPrompt(emailText),
    schema: CRITIC_SCHEMA,
    schemaName: "critic_verdict",
  });
  // The model unreliably follows "empty array if pass=true" (caught by
  // runtime/runAnalytics.ts's first real report: a fully-passing draft still
  // came back with all 11 checklist items dumped into failures, each labeled
  // "PASS"). Prompt-only enforcement of this has already failed once, so
  // enforce it here deterministically instead of asking nicely again.
  return verdict.pass ? { pass: true, failures: [] } : verdict;
}

export async function writeAndCritiqueEmail(opts: {
  account: Account;
  contact: Contact;
  research: ResearchBrief;
  batchIndex: number;
  deps: WriterAgentDeps;
}): Promise<EmailDraft> {
  const draft = await writeEmail(opts);
  const proof = pickProof(opts.research.bestHook + " " + opts.research.operationalFootprint);
  const emailText = `Subject: ${draft.subject}\n\n${draft.body}\n\n${draft.senderName}`;

  let verdict = await critique(emailText, opts.deps);
  let final = draft;
  let rewritten = false;

  if (!verdict.pass) {
    final = await rewriteEmail(draft.writerPrompt, verdict.failures, opts.deps);
    rewritten = true;
    const rewrittenText = `Subject: ${final.subject}\n\n${final.body}\n\n${final.senderName}`;
    verdict = await critique(rewrittenText, opts.deps);
  }

  return {
    contactId: opts.contact.id ?? "",
    subject: final.subject,
    body: final.body,
    senderName: final.senderName,
    sequenceIndex: 0,
    signalUsed: opts.research.bestHook,
    proofUsed: proof.name,
    criticVerdict: { passed: verdict.pass, failures: verdict.failures },
    rewrittenAfterCritic: rewritten,
    status: "ready",
  };
}

/** Generates and critiques the three follow-up touches for a contact that
 * already has a passing (or shipped-flagged) cold email. Same critique + one
 * rewrite pattern as the cold email, just against the follow-up prompt. */
export async function writeAndCritiqueFollowUp(
  sequenceIndex: 1 | 2 | 3,
  ctx: FollowUpContext,
  deps: WriterAgentDeps
): Promise<EmailDraft> {
  const draft: DraftedEmail = await writeFollowUp(sequenceIndex, ctx, deps);
  const emailText = `Subject: ${draft.subject}\n\n${draft.body}\n\n${draft.senderName}`;

  let verdict = await critique(emailText, deps);
  let final = draft;
  let rewritten = false;

  if (!verdict.pass) {
    const rewritePrompt = buildRewritePrompt(draft.writerPrompt, verdict.failures);
    const raw = await freeTextCall({ apiKey: deps.openaiApiKey, model: deps.model, input: rewritePrompt });
    final = { ...parseDraft(raw), writerPrompt: draft.writerPrompt };
    rewritten = true;
    const rewrittenText = `Subject: ${final.subject}\n\n${final.body}\n\n${final.senderName}`;
    verdict = await critique(rewrittenText, deps);
  }

  return {
    contactId: ctx.contact.id ?? "",
    subject: final.subject,
    body: final.body,
    senderName: final.senderName || ctx.senderName,
    sequenceIndex,
    signalUsed: ctx.mechanism,
    proofUsed: ctx.mechanism,
    criticVerdict: { passed: verdict.pass, failures: verdict.failures },
    rewrittenAfterCritic: rewritten,
    status: "ready",
  };
}
