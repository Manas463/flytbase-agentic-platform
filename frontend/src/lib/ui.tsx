import type { ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="eyebrow">
      <span className="inline-block h-[7px] w-[7px] bg-primary" />
      <span>{children}</span>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 style={{ fontFamily: "var(--font-serif)" }} className="text-3xl font-normal text-foreground mt-2">
      {children}
    </h2>
  );
}

export function Divider() {
  return <hr className="divider-dotted my-10" />;
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "ok" | "warn" | "bad" | "accent";
}) {
  const toneMap: Record<string, string> = {
    muted: "border-border text-muted-foreground",
    ok: "border-emerald-500/60 text-emerald-400",
    warn: "border-amber-500/60 text-amber-400",
    bad: "border-red-500/60 text-red-400",
    accent: "border-primary text-primary",
  };
  return (
    <span className={`label inline-flex items-center border px-2 py-[3px] ${toneMap[tone]}`}>
      {children}
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label text-muted-foreground">{label}</span>
      <span className="label text-3xl text-foreground" style={{ letterSpacing: "0.04em" }}>
        {value}
      </span>
    </div>
  );
}

export function SourceLinks({ urls }: { urls: unknown }) {
  const list = Array.isArray(urls) ? (urls as string[]) : [];
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {list.map((u, i) => (
        <a
          key={i}
          href={u}
          target="_blank"
          rel="noreferrer"
          className="label text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-primary"
        >
          [{i + 1}] source
        </a>
      ))}
    </div>
  );
}