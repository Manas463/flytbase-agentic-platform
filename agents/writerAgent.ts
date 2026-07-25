// Ported from the writer branch of the existing n8n pipeline: draft, then
// deterministically strip em dashes regardless of what the model produced.
// Parsing is deliberately strict about the "Subject: ...\n\n<body>\n\n<sender>"
// format the writer prompt demands, since downstream (critic, Sheets export)
// depends on subject/body being cleanly separated.
import type { Account, Contact, ResearchBrief } from "./types.js";
import { freeTextCall } from "../tools/openai.js";
import { buildWriterPrompt, finalizeEmail } from "../skills/emailWriting.js";
import { buildRewritePrompt } from "../skills/critic.js";

export interface WriterAgentDeps {
  openaiApiKey: string;
  model?: string;
}

export interface DraftedEmail {
  subject: string;
  body: string;
  senderName: string;
  writerPrompt: string; // kept verbatim so a rewrite pass can be anchored to it
}

function parseDraft(raw: string): { subject: string; body: string; senderName: string } {
  const subjectMatch = raw.match(/^Subject:\s*(.+)$/m);
  const subject = finalizeEmail(subjectMatch?.[1]?.trim() ?? "");
  const rest = raw.slice((subjectMatch?.index ?? 0) + (subjectMatch?.[0]?.length ?? 0)).trim();
  const parts = rest.split(/\n\s*\n/).filter(Boolean);
  const senderName = finalizeEmail(parts.length > 1 ? parts[parts.length - 1].trim() : "");
  const body = finalizeEmail(parts.length > 1 ? parts.slice(0, -1).join("\n\n").trim() : rest);
  return { subject, body, senderName };
}

export async function writeEmail(opts: {
  account: Account;
  contact: Contact;
  research: ResearchBrief;
  batchIndex: number;
  deps: WriterAgentDeps;
}): Promise<DraftedEmail> {
  const writerPrompt = buildWriterPrompt({
    account: opts.account,
    contact: opts.contact,
    research: opts.research,
    batchIndex: opts.batchIndex,
  });
  const raw = await freeTextCall({ apiKey: opts.deps.openaiApiKey, model: opts.deps.model, input: writerPrompt });
  return { ...parseDraft(raw), writerPrompt };
}

export async function rewriteEmail(writerPrompt: string, failures: string[], deps: WriterAgentDeps): Promise<DraftedEmail> {
  const rewritePrompt = buildRewritePrompt(writerPrompt, failures);
  const raw = await freeTextCall({ apiKey: deps.openaiApiKey, model: deps.model, input: rewritePrompt });
  return { ...parseDraft(raw), writerPrompt };
}
