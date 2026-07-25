// Thin wrapper over the existing Supabase project (zvlchtfozsbjffxkirme). Reuses
// the schema the current frontend already reads (runs/accounts/contacts/emails/
// research) rather than inventing a parallel one, per the charter's "reuse
// existing assets" instruction. New tables (strategy_verdicts, reflections) get
// added here as the new agents need them, not as a wholesale schema replacement.
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // server-side only, bypasses RLS; never ship to the frontend
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set these in the runtime's environment, never hardcode them."
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export async function createRun(): Promise<string> {
  const { data, error } = await getSupabase()
    .from("runs")
    .insert({ status: "running" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function markRunDone(runId: string, summary: {
  accountsFound: number;
  emailsGenerated: number;
  contactsNotFound: number;
  contactsNotFoundDetail: unknown;
}) {
  const { error } = await getSupabase()
    .from("runs")
    .update({
      status: "done",
      accounts_found: summary.accountsFound,
      emails_generated: summary.emailsGenerated,
      contacts_not_found: summary.contactsNotFound,
      contacts_not_found_detail: summary.contactsNotFoundDetail,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw error;
}

/** Calls the existing `import_run_results(p_run_id, p_payload)` Postgres
 * function, the same RPC the real n8n "Import Results" node already called.
 * The payload shape is built by runtime/persistResults.ts, matching the real
 * "Build Run Payload" node's output field-for-field, not guessed. */
export async function importRunResults(runId: string, payload: unknown): Promise<void> {
  const { error } = await getSupabase().rpc("import_run_results", { p_run_id: runId, p_payload: payload });
  if (error) throw error;
}

/** import_run_results only ever inserts one email per contact (matching the
 * real n8n contract), so follow-up touches (sequence_index 1/2/3) are
 * inserted directly here instead. The RPC returns void, no inserted IDs, so
 * the contact's real DB id has to be looked up by (run_id, email) - reliable
 * because follow-ups only ever get generated for a contact whose email was
 * already resolved and already made it through the RPC once. */
export async function getContactIdByEmail(runId: string, email: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("contacts")
    .select("id")
    .eq("run_id", runId)
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string) ?? null;
}

export async function insertFollowUpEmail(row: {
  runId: string;
  contactId: string;
  subject: string;
  body: string;
  signalUsed: string;
  criticVerdict: string;
  rewrittenAfterCritic: boolean;
  sequenceIndex: number;
}): Promise<void> {
  const { error } = await getSupabase().from("emails").insert({
    run_id: row.runId,
    contact_id: row.contactId,
    subject: row.subject,
    body: row.body,
    status: "ready",
    signal_used: row.signalUsed,
    critic_verdict: row.criticVerdict,
    rewritten_after_critic: row.rewrittenAfterCritic,
    sequence_index: row.sequenceIndex,
  });
  if (error) throw error;
}

export async function markRunFailed(runId: string, error: string) {
  const { error: dbError } = await getSupabase()
    .from("runs")
    .update({ status: "failed", error, finished_at: new Date().toISOString() })
    .eq("id", runId);
  if (dbError) throw dbError;
}
