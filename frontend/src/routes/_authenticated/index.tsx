import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eyebrow, SectionTitle, Divider, Stat, Pill } from "@/lib/ui";

export const Route = createFileRoute("/_authenticated/")({
  component: RunPage,
});

type Run = {
  id: string;
  status: string;
  error: string | null;
  accounts_found: number | null;
  emails_generated: number | null;
  contacts_not_found: number | null;
  contacts_not_found_detail: unknown;
  started_at: string;
  finished_at: string | null;
};

const STAGES = ["Accounts", "Research", "Contacts", "Emails"];

async function fetchLatestRun(): Promise<Run | null> {
  const { data, error } = await supabase
    .from("runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Run | null) ?? null;
}

// The most recent COMPLETED run — shown as the summary even while a newer run is still running,
// so the recruiter can review previous results instead of staring at a spinner for 2-3 minutes.
async function fetchLatestDoneRun(): Promise<Run | null> {
  const { data, error } = await supabase
    .from("runs")
    .select("*")
    .eq("status", "done")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Run | null) ?? null;
}

async function fetchTotals(): Promise<{ accounts: number; emails: number }> {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

  const { data: accountsData, error: aErr } = await supabase
    .from("accounts")
    .select("id, company")
    .limit(10000);
  if (aErr) throw aErr;

  const companyKeyById = new Map<string, string>();
  const distinctCompanies = new Set<string>();
  for (const row of accountsData ?? []) {
    const key = norm((row as { company: string | null }).company);
    if (key) {
      distinctCompanies.add(key);
      companyKeyById.set((row as { id: string }).id, key);
    }
  }

  const { data: emailsData, error: eErr } = await supabase
    .from("emails")
    .select("id, contact:contacts!inner(name, account_id)")
    .limit(10000);
  if (eErr) throw eErr;

  const distinctEmailPairs = new Set<string>();
  for (const row of emailsData ?? []) {
    const contact = (row as { contact: { name: string | null; account_id: string } | null }).contact;
    if (!contact) continue;
    const company = companyKeyById.get(contact.account_id) ?? "";
    const name = norm(contact.name);
    if (!company || !name) continue;
    distinctEmailPairs.add(`${company}::${name}`);
  }

  return { accounts: distinctCompanies.size, emails: distinctEmailPairs.size };
}

function RunPage() {
  const qc = useQueryClient();
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [targetVertical, setTargetVertical] = useState("");

  const { data: latest } = useQuery({
    queryKey: ["latest-run"],
    queryFn: fetchLatestRun,
    refetchInterval: (q) => {
      const r = q.state.data as Run | null | undefined;
      if (activeRunId) return 4000;
      if (r?.status === "running") return 4000;
      return false;
    },
  });

  const isRunning = triggering || latest?.status === "running" || !!activeRunId;

  // Last completed run — always shown, even while a newer run is mid-flight. Poll it while a run
  // is in progress so it swaps in the fresh results the moment the new run finishes.
  const { data: latestDone } = useQuery({
    queryKey: ["latest-done-run"],
    queryFn: fetchLatestDoneRun,
    refetchInterval: isRunning ? 4000 : false,
  });

  const { data: totals } = useQuery({
    queryKey: ["run-totals"],
    queryFn: fetchTotals,
    refetchInterval: isRunning ? 4000 : false,
  });

  useEffect(() => {
    if (activeRunId && latest?.id === activeRunId && latest.status !== "running") {
      setActiveRunId(null);
      // A run just finished — refresh everything that depends on it.
      qc.invalidateQueries({ queryKey: ["latest-done-run"] });
      qc.invalidateQueries({ queryKey: ["run-totals"] });
      qc.invalidateQueries({ queryKey: ["accounts-all"] });
      qc.invalidateQueries({ queryKey: ["drafts"] });
    }
  }, [latest, activeRunId, qc]);

  async function handleRun() {
    setTriggerError(null);
    setTriggering(true);
    try {
      const runCampaignUrl = import.meta.env.VITE_RUN_CAMPAIGN_URL || "https://mj463.app.n8n.cloud/webhook/run-campaign";
      const res = await fetch(runCampaignUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target_vertical: targetVertical.trim() }),
      });
      if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
      const json = (await res.json()) as { id?: string };
      if (json.id) setActiveRunId(json.id);
      await qc.invalidateQueries({ queryKey: ["latest-run"] });
    } catch (e) {
      setTriggerError(e instanceof Error ? e.message : String(e));
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div>
      <Eyebrow>01 / Run</Eyebrow>
      <SectionTitle>Trigger the outbound pipeline</SectionTitle>
      <p className="mt-3 text-muted-foreground max-w-xl">
        Optional: set a target vertical, or leave blank for the default LatAm mining brief. Adds to
        the accounts list below. Takes a few minutes.
      </p>

      <div className="mt-8 max-w-xl">
        <label className="label text-muted-foreground block mb-2" htmlFor="target-vertical">
          Target vertical
        </label>
        <input
          id="target-vertical"
          type="text"
          value={targetVertical}
          onChange={(e) => setTargetVertical(e.target.value)}
          placeholder="Large-scale lithium, copper, and iron ore mining operations in Latin America"
          className="w-full bg-input/40 border border-border px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
        />
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={handleRun}
          disabled={isRunning}
          className="label bg-primary text-primary-foreground px-6 py-3 hover:opacity-90 disabled:opacity-50"
        >
          {isRunning ? "Running…" : "Run campaign"}
        </button>
        {triggerError && <span className="label text-red-400">{triggerError}</span>}
      </div>

      {isRunning && (
        <>
          <StageProgress startedAt={latest?.started_at} />
          {latestDone && (
            <p className="label text-primary mt-4">
              A new run is in progress — your last completed run is shown below and will refresh
              automatically when the new one finishes.
            </p>
          )}
        </>
      )}

      <Divider />

      {!latest && !latestDone && !isRunning && (
        <p className="text-muted-foreground">No runs yet. Click Run to start.</p>
      )}

      {latest && latest.status === "failed" && (
        <div className="mb-10">
          <Eyebrow>Last run / Failed</Eyebrow>
          <SectionTitle>The pipeline broke</SectionTitle>
          <pre className="mt-4 border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300 whitespace-pre-wrap font-mono">
            {latest.error ?? "(no error message returned)"}
          </pre>
          <p className="label text-muted-foreground mt-3">
            Started {new Date(latest.started_at).toLocaleString()}
          </p>
        </div>
      )}

      {latestDone && (
        <div>
          <Eyebrow>Latest completed run</Eyebrow>
          <SectionTitle>Summary</SectionTitle>
          <div className="mt-6">
            <p className="label text-muted-foreground mb-4">This run</p>
            <div className="grid grid-cols-2 gap-8">
              <Stat label="Accounts found" value={latestDone.accounts_found ?? 0} />
              <Stat label="Emails generated" value={latestDone.emails_generated ?? 0} />
            </div>
          </div>
          <div className="mt-10 border-t border-dotted border-border pt-6">
            <p className="label text-muted-foreground mb-4">All runs / totals</p>
            <div className="grid grid-cols-2 gap-8">
              <Stat label="Accounts found (total)" value={totals?.accounts ?? "—"} />
              <Stat label="Emails generated (total)" value={totals?.emails ?? "—"} />
            </div>
          </div>
          <div className="mt-8 flex items-center gap-4 flex-wrap">
            <Link
              to="/accounts"
              className="label border border-primary text-primary px-5 py-2 hover:bg-primary hover:text-primary-foreground"
            >
              Review accounts →
            </Link>
            <Link
              to="/drafts"
              className="label bg-primary text-primary-foreground px-5 py-2 hover:opacity-90"
            >
              Open all drafts →
            </Link>
            <span className="label text-muted-foreground">
              Finished{" "}
              {latestDone.finished_at ? new Date(latestDone.finished_at).toLocaleString() : "—"}
            </span>
          </div>
          <NotFoundDetail run={latestDone} />
        </div>
      )}
    </div>
  );
}

function StageProgress({ startedAt }: { startedAt?: string | null }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = useMemo(() => {
    if (!startedAt) return tick;
    return Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  }, [startedAt, tick]);

  // Rough visual approximation: cycle through stages ~every 45s
  const active = Math.min(STAGES.length - 1, Math.floor(elapsed / 45));

  return (
    <div className="mt-10 border-t border-dotted border-border pt-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {STAGES.map((s, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <div key={s} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-[9px] w-[9px] ${
                    done ? "bg-primary" : current ? "bg-primary animate-pulse" : "bg-muted"
                  }`}
                />
                <span className="label text-muted-foreground">0{i + 1}</span>
              </div>
              <span
                className={`label ${current || done ? "text-foreground" : "text-muted-foreground"}`}
              >
                {s}
              </span>
            </div>
          );
        })}
      </div>
      <p className="label text-muted-foreground mt-4">
        Elapsed {Math.floor(elapsed / 60)}m {elapsed % 60}s — polling every 4s
      </p>
    </div>
  );
}

function NotFoundDetail({ run }: { run: Run }) {
  const list = Array.isArray(run.contacts_not_found_detail)
    ? (run.contacts_not_found_detail as Array<{ company?: string; reason?: string }>)
    : [];
  if (list.length === 0) return null;
  return (
    <div className="mt-10">
      <Eyebrow>Contacts not found</Eyebrow>
      <ul className="mt-4 divide-y divide-dotted divide-border">
        {list.map((c, i) => (
          <li key={i} className="py-3 flex justify-between gap-6">
            <span className="text-foreground">{c.company ?? "—"}</span>
            <span className="label text-muted-foreground">{c.reason ?? "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}