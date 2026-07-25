import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Pill } from "@/lib/ui";

export type Contact = {
  id: string;
  account_id?: string;
  name: string | null;
  title: string | null;
  seniority: string | null;
  linkedin_url: string | null;
  email: string | null;
  email_status: string | null;
  email_verified_status: string | null;
  email_deliverable: boolean | null;
  notes: string | null;
};

export type Email = {
  id: string;
  contact_id: string;
  subject: string | null;
  body: string | null;
  status: string;
  signal_used: string | null;
  critic_verdict: string | null;
  rewritten_after_critic: boolean | null;
};

export function normalizeStatus(c: Contact): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  const v = (c.email_verified_status ?? c.email_status ?? "").toLowerCase();
  if (c.email_deliverable === true || v.includes("valid") || v.includes("deliverable") || v.includes("verified"))
    return { label: "Verified", tone: "ok" };
  if (v.includes("risky") || v.includes("catch") || v.includes("accept_all") || v.includes("unknown"))
    return { label: "Risky", tone: "warn" };
  if (c.email_deliverable === false || v.includes("invalid") || v.includes("undeliverable") || v.includes("bounce"))
    return { label: "Invalid", tone: "bad" };
  if (!c.email) return { label: "Not found", tone: "muted" };
  return { label: v || "Unknown", tone: "muted" };
}

export function EmailStatusPill({ contact }: { contact: Contact }) {
  const s = normalizeStatus(contact);
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export function EmailCard({
  email,
  contact,
  accountName,
  invalidateKeys = ["account"],
}: {
  email: Email;
  contact?: Contact;
  accountName?: ReactNode;
  invalidateKeys?: string[];
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(email.subject ?? "");
  const [body, setBody] = useState(email.body ?? "");
  const [copied, setCopied] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("emails").update({ subject, body }).eq("id", email.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditing(false);
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
  });

  function copy() {
    const text = `${subject}\n\n${body}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const gmailUrl = contact?.email
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(contact.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : null;

  return (
    <article className="border-t border-dotted border-border pt-6">
      <header>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="label text-primary text-xl">
            To {contact?.name ?? "—"}
            {contact?.email ? ` · ${contact.email}` : ""}
          </div>
          <Pill tone={email.status === "sent" ? "ok" : email.status === "ready" ? "accent" : "muted"}>
            {email.status}
          </Pill>
        </div>
        {accountName && (
          <div className="mt-2 label text-muted-foreground">{accountName}</div>
        )}
        {email.signal_used && (
          <div className="mt-2 label text-muted-foreground border border-border px-3 py-2">
            Signal: {email.signal_used}
          </div>
        )}
      </header>

      <div className="mt-6">
        {editing ? (
          <div className="space-y-3">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-input/40 border border-border px-3 py-2 text-foreground focus:outline-none focus:border-primary"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className="w-full bg-input/40 border border-border px-3 py-2 text-foreground font-sans leading-relaxed focus:outline-none focus:border-primary"
            />
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-semibold text-foreground">{subject || "(no subject)"}</h3>
            <pre className="mt-3 text-foreground/90 whitespace-pre-wrap font-sans leading-relaxed">
              {body || "(empty body)"}
            </pre>
          </div>
        )}
        {save.error && <p className="mt-3 label text-red-400">{(save.error as Error).message}</p>}
      </div>

      <div className="mt-5 flex gap-2 flex-wrap">
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="label border border-border px-3 py-2 hover:border-primary hover:text-primary"
          >
            Edit
          </button>
        )}
        {editing && (
          <>
            <button
              onClick={() => {
                setSubject(email.subject ?? "");
                setBody(email.body ?? "");
                setEditing(false);
              }}
              className="label border border-border px-3 py-2 hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="label bg-foreground text-background px-3 py-2 disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
          </>
        )}
        <button
          onClick={copy}
          className="label border border-border px-3 py-2 hover:border-primary hover:text-primary"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
        {gmailUrl && (
          <button
            type="button"
            onClick={() => window.open(gmailUrl, "_blank", "noopener,noreferrer")}
            className="label bg-primary text-primary-foreground px-4 py-2 hover:opacity-90"
          >
            Send in Gmail ↗
          </button>
        )}
      </div>
    </article>
  );
}
