import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eyebrow, SectionTitle, Divider } from "@/lib/ui";
import { EmailCard, normalizeStatus, type Contact, type Email } from "@/components/EmailCard";

export const Route = createFileRoute("/_authenticated/drafts")({
  component: DraftsPage,
});

type Account = {
  id: string;
  run_id: string;
  company: string;
  icp_score: number | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

async function fetchAllDrafts(): Promise<{
  contactIds: string[]; // one entry per contact, newest-thread-first, already deduped across re-runs
  emailsByContact: Record<string, Email[]>; // each contact's full touch sequence, sorted by sequence_index
  contacts: Record<string, Contact>;
  accounts: Record<string, Account>;
}> {
  // Span ALL runs (not just the latest) so every drafted thread is reachable.
  const { data: accounts, error: accountsErr } = await supabase
    .from("accounts")
    .select("id, run_id, company, icp_score")
    .limit(10000);
  if (accountsErr) throw accountsErr;

  const accountList = (accounts as Account[]) ?? [];
  const accountIds = accountList.map((a) => a.id);
  const empty = { contactIds: [], emailsByContact: {}, contacts: {}, accounts: {} };
  if (accountIds.length === 0) return empty;

  const { data: contacts, error: contactsErr } = await supabase
    .from("contacts")
    .select("*")
    .in("account_id", accountIds)
    .limit(10000);
  if (contactsErr) throw contactsErr;

  const contactList = (contacts as Contact[]) ?? [];
  const contactIds = contactList.map((c) => c.id);
  if (contactIds.length === 0) return empty;

  const { data: emails, error: emailsErr } = await supabase
    .from("emails")
    .select("*")
    .in("contact_id", contactIds)
    .order("created_at", { ascending: false })
    .limit(10000);
  if (emailsErr) throw emailsErr;

  const contactsById = Object.fromEntries(contactList.map((c) => [c.id, c]));
  const accountsById = Object.fromEntries(accountList.map((a) => [a.id, a]));

  // Group every touch by contact first (a thread is 1-4 rows: cold email +
  // up to 3 follow-ups), sorted so the cold email always renders first.
  const emailsByContact: Record<string, Email[]> = {};
  for (const e of (emails as Email[]) ?? []) {
    (emailsByContact[e.contact_id] ??= []).push(e);
  }
  for (const list of Object.values(emailsByContact)) {
    list.sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0));
  }

  // Dedupe at the CONTACT level now, not the email level - one thread per
  // (company + contact identity). Emails are newest-first, so the first
  // contact_id encountered for a given identity belongs to the most recent run.
  const seen = new Set<string>();
  const contactIdsOut: string[] = [];
  for (const e of (emails as Email[]) ?? []) {
    if (contactIdsOut.includes(e.contact_id)) continue;
    const contact = contactsById[e.contact_id];
    const account = contact ? accountsById[contact.account_id as string] : undefined;
    const key = `${norm(account?.company)}::${norm(contact?.name)}|${norm(contact?.email)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contactIdsOut.push(e.contact_id);
  }

  return { contactIds: contactIdsOut, emailsByContact, contacts: contactsById, accounts: accountsById };
}

function DraftsPage() {
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["drafts"],
    queryFn: fetchAllDrafts,
  });

  // Filter ("verified only") and sort are independent, and now operate on
  // threads (one entry per contact) rather than individual email rows.
  const shown = useMemo(() => {
    if (!data) return [];
    let ids = data.contactIds; // fetched newest-thread-first
    if (verifiedOnly) {
      ids = ids.filter((id) => {
        const c = data.contacts[id];
        return c ? normalizeStatus(c).label === "Verified" : false;
      });
    }
    const out = [...ids];
    if (sort === "oldest") out.reverse();
    return out;
  }, [data, sort, verifiedOnly]);

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-3 text-muted-foreground hover:text-primary"
        >
          <span aria-hidden className="text-3xl leading-none">←</span>
          <span className="label">Home</span>
        </Link>
      </div>
      <Eyebrow>03 / Drafts</Eyebrow>
      <SectionTitle>All drafted emails</SectionTitle>

      {isLoading && <p className="mt-8 text-muted-foreground">Loading…</p>}
      {error && <p className="mt-8 text-red-400">{(error as Error).message}</p>}

      {data && data.contactIds.length === 0 && !isLoading && (
        <p className="mt-8 text-muted-foreground">No drafts yet.</p>
      )}

      {data && data.contactIds.length > 0 && (
        <div className="mt-8">
          <div className="mb-8 flex items-start justify-between gap-6 flex-wrap">
            <p className="label text-muted-foreground">
              {verifiedOnly
                ? `${shown.length} of ${data.contactIds.length} threads`
                : `${data.contactIds.length} thread${data.contactIds.length === 1 ? "" : "s"} across all runs`}
            </p>
            <div className="flex items-start gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="label text-muted-foreground mr-1">Filter</span>
                <button
                  onClick={() => setVerifiedOnly((v) => !v)}
                  aria-pressed={verifiedOnly}
                  className={`label px-3 py-2 border ${
                    verifiedOnly
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Verified only
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="label text-muted-foreground mr-1">Sort</span>
                <button
                  onClick={() => setSort("newest")}
                  className={`label px-3 py-2 border ${
                    sort === "newest"
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Newest
                </button>
                <button
                  onClick={() => setSort("oldest")}
                  className={`label px-3 py-2 border ${
                    sort === "oldest"
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Oldest
                </button>
              </div>
            </div>
          </div>
          {shown.length === 0 && (
            <p className="text-muted-foreground mb-8">No drafts match the selected filters.</p>
          )}
          <div className="space-y-8">
            {shown.map((contactId) => {
              const contact = data.contacts[contactId];
              const account = contact ? data.accounts[contact.account_id as string] : undefined;
              const touches = data.emailsByContact[contactId] ?? [];
              return (
                <div key={contactId}>
                  <EmailCard
                    emails={touches}
                    contact={contact}
                    accountName={
                      account ? (
                        <Link
                          to="/accounts/$id"
                          params={{ id: account.id }}
                          className="hover:text-primary hover:underline decoration-dotted underline-offset-4"
                        >
                          {account.company} · ICP {account.icp_score ?? "—"}
                        </Link>
                      ) : undefined
                    }
                    invalidateKeys={["drafts", "account"]}
                  />
                  {account && (
                    <div className="mt-4">
                      <Link
                        to="/accounts/$id"
                        params={{ id: account.id }}
                        hash="dossier"
                        className="label border border-border px-3 py-2 hover:border-primary hover:text-primary"
                      >
                        Open dossier →
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Divider />

      <Link
        to="/accounts"
        className="label border border-border px-5 py-2 hover:border-primary hover:text-primary"
      >
        ← Back to accounts
      </Link>
    </div>
  );
}
