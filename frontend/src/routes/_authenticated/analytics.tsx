import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eyebrow, SectionTitle, Divider, Stat, Pill } from "@/lib/ui";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: AnalyticsPage,
});

// Mirrors EmailCard.tsx's normalizeStatus, kept local so this page only
// depends on the four columns it actually needs.
type StatusTone = "ok" | "warn" | "bad" | "muted";
function statusOf(row: {
  email: string | null;
  email_status: string | null;
  email_verified_status: string | null;
  email_deliverable: boolean | null;
}): { label: string; tone: StatusTone } {
  const v = (row.email_verified_status ?? row.email_status ?? "").toLowerCase();
  if (
    row.email_deliverable === true ||
    v.includes("valid") ||
    v.includes("deliverable") ||
    v.includes("verified")
  )
    return { label: "Verified", tone: "ok" };
  if (
    v.includes("risky") ||
    v.includes("catch") ||
    v.includes("accept_all") ||
    v.includes("unknown")
  )
    return { label: "Risky", tone: "warn" };
  if (
    row.email_deliverable === false ||
    v.includes("invalid") ||
    v.includes("undeliverable") ||
    v.includes("bounce")
  )
    return { label: "Invalid", tone: "bad" };
  if (!row.email) return { label: "Not found", tone: "muted" };
  return { label: v || "Unknown", tone: "muted" };
}

type RunRow = {
  id: string;
  status: string;
  accounts_found: number | null;
  emails_generated: number | null;
  started_at: string;
  finished_at: string | null;
};

type ContactRow = {
  role_match: string | null;
  email: string | null;
  email_status: string | null;
  email_verified_status: string | null;
  email_deliverable: boolean | null;
};

type EmailRow = { rewritten_after_critic: boolean | null };
type AccountRow = { commodity: string | null; hq_country: string | null };

async function fetchAnalytics() {
  const [contactsRes, emailsRes, accountsRes, runsRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("role_match, email, email_status, email_verified_status, email_deliverable")
      .limit(10000),
    supabase.from("emails").select("rewritten_after_critic").limit(10000),
    supabase.from("accounts").select("commodity, hq_country").limit(10000),
    supabase
      .from("runs")
      .select("id, status, accounts_found, emails_generated, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(50),
  ]);
  if (contactsRes.error) throw contactsRes.error;
  if (emailsRes.error) throw emailsRes.error;
  if (accountsRes.error) throw accountsRes.error;
  if (runsRes.error) throw runsRes.error;

  const contacts = (contactsRes.data as ContactRow[]) ?? [];
  const emails = (emailsRes.data as EmailRow[]) ?? [];
  const accounts = (accountsRes.data as AccountRow[]) ?? [];
  const runs = (runsRes.data as RunRow[]) ?? [];

  // Email verification breakdown
  const statusCounts: Record<string, number> = {
    Verified: 0,
    Risky: 0,
    Invalid: 0,
    "Not found": 0,
  };
  for (const c of contacts) {
    const s = statusOf(c);
    statusCounts[s.label] = (statusCounts[s.label] ?? 0) + 1;
  }

  // Critic pass rate
  const firstPass = emails.filter((e) => e.rewritten_after_critic === false).length;
  const rewritten = emails.filter((e) => e.rewritten_after_critic === true).length;

  // Role-fit distribution
  const roleCounts: Record<string, number> = {};
  for (const c of contacts) {
    const key = (c.role_match ?? "unknown").toLowerCase();
    roleCounts[key] = (roleCounts[key] ?? 0) + 1;
  }

  // Commodity + geography spread
  const commodityCounts: Record<string, number> = {};
  const countryCounts: Record<string, number> = {};
  for (const a of accounts) {
    const c = (a.commodity ?? "unknown").trim() || "unknown";
    const g = (a.hq_country ?? "unknown").trim() || "unknown";
    commodityCounts[c] = (commodityCounts[c] ?? 0) + 1;
    countryCounts[g] = (countryCounts[g] ?? 0) + 1;
  }

  return {
    totalContacts: contacts.length,
    statusCounts,
    totalEmails: emails.length,
    firstPass,
    rewritten,
    roleCounts,
    commodityCounts,
    countryCounts,
    runs,
  };
}

function BarRow({
  label,
  value,
  total,
  tone = "accent",
}: {
  label: string;
  value: number;
  total: number;
  tone?: "ok" | "warn" | "bad" | "muted" | "accent";
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const barColor: Record<string, string> = {
    ok: "bg-emerald-500",
    warn: "bg-amber-500",
    bad: "bg-red-500",
    muted: "bg-muted-foreground",
    accent: "bg-primary",
  };
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="label text-foreground">{label}</span>
        <span className="label text-muted-foreground">
          {value} · {pct}%
        </span>
      </div>
      <div className="mt-2 h-[3px] w-full bg-border">
        <div className={`h-[3px] ${barColor[tone]}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
    </div>
  );
}

function AnalyticsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics"],
    queryFn: fetchAnalytics,
  });

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-3 text-muted-foreground hover:text-primary"
        >
          <span aria-hidden className="text-3xl leading-none">
            ←
          </span>
          <span className="label">Home</span>
        </Link>
      </div>
      <Eyebrow>04 / Analytics</Eyebrow>
      <SectionTitle>Data quality &amp; coverage across all runs</SectionTitle>
      <p className="mt-3 text-muted-foreground max-w-xl">
        How the pipeline is performing: contact and email quality, AI critic outcomes, and where the
        agent is looking. Engagement metrics (opens, replies, meetings) connect once a sending tool
        is wired in — see the note at the bottom.
      </p>

      {isLoading && <p className="mt-8 text-muted-foreground">Loading…</p>}
      {error && <p className="mt-8 text-red-400">{(error as Error).message}</p>}

      {data && (
        <>
          <Divider />

          <Eyebrow>Email quality</Eyebrow>
          <SectionTitle>Verification breakdown</SectionTitle>
          <p className="label text-muted-foreground mt-2">{data.totalContacts} contacts total</p>
          <div className="mt-4 divide-y divide-dotted divide-border">
            <BarRow
              label="Verified"
              value={data.statusCounts["Verified"] ?? 0}
              total={data.totalContacts}
              tone="ok"
            />
            <BarRow
              label="Risky (catch-all)"
              value={data.statusCounts["Risky"] ?? 0}
              total={data.totalContacts}
              tone="warn"
            />
            <BarRow
              label="Invalid"
              value={data.statusCounts["Invalid"] ?? 0}
              total={data.totalContacts}
              tone="bad"
            />
            <BarRow
              label="Not found"
              value={data.statusCounts["Not found"] ?? 0}
              total={data.totalContacts}
              tone="muted"
            />
          </div>

          <Divider />

          <Eyebrow>AI critic</Eyebrow>
          <SectionTitle>Draft quality on first pass</SectionTitle>
          <div className="mt-6 grid grid-cols-2 gap-8 max-w-md">
            <Stat label="Passed first try" value={`${data.firstPass} / ${data.totalEmails}`} />
            <Stat label="Needed a rewrite" value={`${data.rewritten} / ${data.totalEmails}`} />
          </div>

          <Divider />

          <Eyebrow>Targeting</Eyebrow>
          <SectionTitle>Who the agent is reaching</SectionTitle>
          <p className="label text-muted-foreground mt-2 mb-2">Role fit (contacts)</p>
          <div className="flex flex-wrap gap-2 mb-8">
            {Object.entries(data.roleCounts).map(([role, count]) => (
              <Pill key={role} tone={role === "other" || role === "unknown" ? "muted" : "accent"}>
                {role} · {count}
              </Pill>
            ))}
            {Object.keys(data.roleCounts).length === 0 && (
              <span className="text-muted-foreground">No contacts yet.</span>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-10 mt-6">
            <div>
              <p className="label text-muted-foreground mb-3">By commodity</p>
              <ul className="divide-y divide-dotted divide-border">
                {Object.entries(data.commodityCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => (
                    <li key={name} className="py-2 flex justify-between">
                      <span className="text-foreground">{name}</span>
                      <span className="label text-muted-foreground">{count}</span>
                    </li>
                  ))}
              </ul>
            </div>
            <div>
              <p className="label text-muted-foreground mb-3">By HQ country</p>
              <ul className="divide-y divide-dotted divide-border">
                {Object.entries(data.countryCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => (
                    <li key={name} className="py-2 flex justify-between">
                      <span className="text-foreground">{name}</span>
                      <span className="label text-muted-foreground">{count}</span>
                    </li>
                  ))}
              </ul>
            </div>
          </div>

          <Divider />

          <Eyebrow>History</Eyebrow>
          <SectionTitle>Runs over time</SectionTitle>
          {data.runs.length === 0 ? (
            <p className="mt-8 text-muted-foreground">No runs yet.</p>
          ) : (
            <ul className="mt-6 divide-y divide-dotted divide-border">
              {data.runs.map((r) => (
                <li
                  key={r.id}
                  className="py-4 grid grid-cols-[1fr_auto_auto_auto] gap-6 items-center"
                >
                  <span className="label text-muted-foreground">
                    {new Date(r.started_at).toLocaleString()}
                  </span>
                  <span className="label text-foreground">{r.accounts_found ?? 0} accounts</span>
                  <span className="label text-foreground">{r.emails_generated ?? 0} emails</span>
                  <Pill tone={r.status === "done" ? "ok" : r.status === "failed" ? "bad" : "warn"}>
                    {r.status}
                  </Pill>
                </li>
              ))}
            </ul>
          )}

          <Divider />

          <Eyebrow>Campaign performance</Eyebrow>
          <SectionTitle>Engagement — not connected yet</SectionTitle>
          <div className="mt-4 border border-dotted border-border p-6 max-w-2xl">
            <p className="text-muted-foreground">
              Open rate, reply rate, positive-reply rate, bounce rate, and meetings booked require
              emails to actually be sent and tracked. This system currently drafts and verifies
              emails but does not send them. These tiles light up automatically the moment a sending
              tool (Smartlead or Instantly) is connected and starts writing into the database.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Pill tone="muted">Open rate</Pill>
              <Pill tone="muted">Reply rate</Pill>
              <Pill tone="muted">Positive-reply rate</Pill>
              <Pill tone="muted">Bounce rate</Pill>
              <Pill tone="muted">Meetings booked</Pill>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
