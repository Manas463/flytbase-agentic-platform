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

export async function markRunFailed(runId: string, error: string) {
  const { error: dbError } = await getSupabase()
    .from("runs")
    .update({ status: "failed", error, finished_at: new Date().toISOString() })
    .eq("id", runId);
  if (dbError) throw dbError;
}
