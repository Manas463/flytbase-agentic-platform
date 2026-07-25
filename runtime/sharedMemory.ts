// Shared Memory layer per the charter: agents write findings here instead of
// passing everything forward as ever-growing prompt text (the old n8n pattern
// was literally threading `j.writer_prompt` etc. through node outputs). Backed
// by ONE new Supabase table, `run_memory` (run_id, key, value jsonb, updated_at),
// added alongside the existing runs/accounts/contacts/emails/research tables,
// not replacing them. Run this SQL once against the existing Supabase project
// before using this module:
//
//   create table if not exists run_memory (
//     run_id uuid not null,
//     key text not null,
//     value jsonb not null,
//     updated_at timestamptz not null default now(),
//     primary key (run_id, key)
//   );
import { getSupabase } from "../tools/supabase.js";

export async function setMemory(runId: string, key: string, value: unknown): Promise<void> {
  const { error } = await getSupabase()
    .from("run_memory")
    .upsert({ run_id: runId, key, value, updated_at: new Date().toISOString() }, { onConflict: "run_id,key" });
  if (error) throw error;
}

export async function getMemory<T = unknown>(runId: string, key: string): Promise<T | null> {
  const { data, error } = await getSupabase()
    .from("run_memory")
    .select("value")
    .eq("run_id", runId)
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return (data?.value as T) ?? null;
}

export async function listMemoryKeys(runId: string, prefix: string): Promise<string[]> {
  const { data, error } = await getSupabase()
    .from("run_memory")
    .select("key")
    .eq("run_id", runId)
    .like("key", `${prefix}%`);
  if (error) throw error;
  return (data ?? []).map((r) => r.key as string);
}

/** Convenience wrappers for the shapes every agent actually reads/writes;
 * thin, but they keep call sites from hand-rolling key strings everywhere. */
export const memoryKeys = {
  accounts: () => "accounts",
  strategy: (accountId: string) => `strategy:${accountId}`,
  strategyAttempt: (accountId: string, attempt: number) => `strategy_attempt:${accountId}:${attempt}`,
  research: (accountId: string) => `research:${accountId}`,
  contacts: (accountId: string) => `contacts:${accountId}`,
  emailDraft: (contactId: string) => `email_draft:${contactId}`,
  followUps: (contactId: string) => `follow_ups:${contactId}`,
  reflection: (stage: string, id: string) => `reflection:${stage}:${id}`,
};
