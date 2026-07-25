import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eyebrow, SectionTitle, Divider, SourceLinks } from "@/lib/ui";
import { EmailCard, EmailStatusPill, type Contact, type Email } from "@/components/EmailCard";

export const Route = createFileRoute("/_authenticated/accounts/$id")({
  component: AccountDetail,
});

type Account = {
  id: string;
  run_id: string;
  company: string;
  domain: string | null;
  hq_country: string | null;
  latam_sites: string | null;
  commodity: string | null;
  scale_evidence: string | null;
  ops_evidence: string | null;
  why_fit_vs_anchor: string | null;
  icp_score: number | null;
  ownership_flags: string | null;
  sources: unknown;
};

type Research = {
  id: string;
  recent_news: unknown;
  operational_footprint: string | null;
  tech_or_expansion_signals: unknown;
  hazard_and_247_context: string | null;
  contracted_crew_context: string | null;
  best_hook: string | null;
  best_hook_source: string | null;
  sources: unknown;
};

async function fetchAccountBundle(id: string) {
  const [{ data: account, error: aErr }, { data: research }, { data: contacts }, { data: emails }] =
    await Promise.all([
      supabase.from("accounts").select("*").eq("id", id).single(),
      supabase.from("research").select("*").eq("account_id", id).maybeSingle(),
      supabase.from("contacts").select("*").eq("account_id", id),
      supabase
        .from("emails")
        .select("*")
        .in(
          "contact_id",
          (
            await supabase.from("contacts").select("id").eq("account_id", id)
          ).data?.map((c) => c.id) ?? [],
        ),
    ]);
  if (aErr) throw aErr;
  return {
    account: account as Account,
    research: (research as Research | null) ?? null,
    contacts: (contacts as Contact[]) ?? [],
    emails: (emails as Email[]) ?? [],
  };
}

function AccountDetail() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["account", id],
    queryFn: () => fetchAccountBundle(id),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (error) return <p className="text-red-400">{(error as Error).message}</p>;
  if (!data) return null;

  const { account, research, contacts, emails } = data;

  return (
    <div>
      <Link
        to="/accounts"
        className="inline-flex items-center gap-3 text-muted-foreground hover:text-primary"
      >
        <span aria-hidden className="text-3xl leading-none">←</span>
        <span className="label">Accounts</span>
      </Link>
      <div className="mt-4 flex items-baseline gap-6 flex-wrap">
        <h1 style={{ fontFamily: "var(--font-serif)" }} className="text-5xl">
          {account.company}
        </h1>
        <span className="label text-3xl text-primary">ICP {account.icp_score ?? "—"}</span>
      </div>
      <p className="label text-muted-foreground mt-3">
        {account.domain ?? "—"} · {account.hq_country ?? "—"} · {account.commodity ?? "—"}
      </p>

      <div className="mt-8 grid md:grid-cols-2 gap-8">
        <Field label="LATAM sites" value={account.latam_sites} />
        <Field label="Ownership" value={account.ownership_flags} />
        <Field label="Scale evidence" value={account.scale_evidence} />
        <Field label="Ops evidence" value={account.ops_evidence} />
        <Field label="Why fit vs anchor" value={account.why_fit_vs_anchor} full />
      </div>
      <div className="mt-6">
        <SourceLinks urls={account.sources} />
      </div>

      <Divider />

      <div id="dossier" className="scroll-mt-24 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow>Dossier</Eyebrow>
          <SectionTitle>Research</SectionTitle>
        </div>
        <a
          href="#emails"
          className="label border border-border px-3 py-2 hover:border-primary hover:text-primary"
        >
          Open drafts ↓
        </a>
      </div>
      {!research && <p className="mt-6 text-muted-foreground">No research recorded.</p>}
      {research && (
        <div className="mt-6 space-y-8">
          {research.best_hook && (
            <div className="border-l-2 border-primary pl-4">
              <div className="label text-primary">Best hook</div>
              <p className="mt-2 text-lg text-foreground">{research.best_hook}</p>
              {research.best_hook_source && (
                <a
                  href={research.best_hook_source}
                  target="_blank"
                  rel="noreferrer"
                  className="label text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-primary"
                >
                  source ↗
                </a>
              )}
            </div>
          )}

          <NewsList news={research.recent_news} />

          <Field label="Operational footprint" value={research.operational_footprint} full />
          <SignalsList signals={research.tech_or_expansion_signals} />
          <Field label="Hazard / 24-7 context" value={research.hazard_and_247_context} full />
          <Field label="Contracted crew context" value={research.contracted_crew_context} full />

          <SourceLinks urls={research.sources} />
        </div>
      )}

      <Divider />

      <Eyebrow>People</Eyebrow>
      <SectionTitle>Contacts</SectionTitle>
      {contacts.length === 0 && <p className="mt-6 text-muted-foreground">No contacts.</p>}
      <ul className="mt-6 divide-y divide-dotted divide-border">
        {contacts.map((c) => (
          <li key={c.id} className="py-5 grid md:grid-cols-[1.4fr_1fr_auto] gap-4 items-start">
            <div>
              <div className="text-foreground text-lg">{c.name ?? "—"}</div>
              <div className="label text-muted-foreground mt-1">
                {c.title ?? "—"}
                {c.seniority ? ` · ${c.seniority}` : ""}
              </div>
              {c.linkedin_url && (
                <a
                  href={c.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="label text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-primary"
                >
                  linkedin ↗
                </a>
              )}
            </div>
            <div className="text-sm text-foreground/90 break-all">{c.email ?? "—"}</div>
            <EmailStatusPill contact={c} />
          </li>
        ))}
      </ul>

      <Divider />

      <div id="emails" className="scroll-mt-24">
        <Eyebrow>Drafts</Eyebrow>
        <SectionTitle>Emails</SectionTitle>
      </div>
      {emails.length === 0 && <p className="mt-6 text-muted-foreground">No drafts yet.</p>}
      <div className="mt-6 space-y-8">
        {emails.map((e) => {
          const contact = contacts.find((c) => c.id === e.contact_id);
          return <EmailCard key={e.id} email={e} contact={contact} />;
        })}
      </div>
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: string | null; full?: boolean }) {
  if (!value) return null;
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="label text-muted-foreground">{label}</div>
      <p className="mt-2 text-foreground/90 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function NewsList({ news }: { news: unknown }) {
  const list = Array.isArray(news)
    ? (news as Array<{ date?: string; item?: string; source_url?: string }>)
    : [];
  if (list.length === 0) return null;
  return (
    <div>
      <div className="label text-muted-foreground">Recent news</div>
      <ul className="mt-2 divide-y divide-dotted divide-border">
        {list.map((n, i) => (
          <li key={i} className="py-3">
            <div className="flex gap-4 items-baseline">
              <span className="label text-muted-foreground w-24 shrink-0">{n.date ?? "—"}</span>
              <span className="text-foreground/90">{n.item ?? "—"}</span>
            </div>
            {n.source_url && (
              <a
                href={n.source_url}
                target="_blank"
                rel="noreferrer"
                className="label text-muted-foreground ml-28 underline decoration-dotted underline-offset-4 hover:text-primary"
              >
                source ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignalsList({ signals }: { signals: unknown }) {
  const list = Array.isArray(signals) ? (signals as string[]) : [];
  if (list.length === 0) return null;
  return (
    <div>
      <div className="label text-muted-foreground">Tech / expansion signals</div>
      <ul className="mt-2 space-y-1">
        {list.map((s, i) => (
          <li key={i} className="flex gap-3 items-baseline text-foreground/90">
            <span className="inline-block h-[6px] w-[6px] bg-primary mt-2 shrink-0" />
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
