// Ported from "Build Critic Prompt" + the single critic-to-rewrite pass in the
// existing n8n pipeline. Exactly one rewrite attempt, never a loop: if the
// rewrite still fails, the email ships with criticVerdict.passed=false and
// rewrittenAfterCritic=true so a human can see it was flagged, rather than
// spending unlimited model calls chasing a perfect score.
import type { Account, Contact, EmailDraft, ResearchBrief } from "./types.js";
import { structuredCall } from "../tools/openai.js";
import { buildCriticPrompt, CRITIC_SCHEMA } from "../skills/critic.js";
import { pickProof } from "../skills/proofLibrary.js";
import { writeEmail, rewriteEmail, type WriterAgentDeps } from "./writerAgent.js";

interface CriticVerdict {
  pass: boolean;
  failures: string[];
}

async function critique(emailText: string, deps: WriterAgentDeps): Promise<CriticVerdict> {
  return structuredCall<CriticVerdict>({
    apiKey: deps.openaiApiKey,
    model: deps.model,
    input: buildCriticPrompt(emailText),
    schema: CRITIC_SCHEMA,
    schemaName: "critic_verdict",
  });
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
    signalUsed: opts.research.bestHook,
    proofUsed: proof.name,
    criticVerdict: { passed: verdict.pass, failures: verdict.failures },
    rewrittenAfterCritic: rewritten,
    status: "ready",
  };
}
