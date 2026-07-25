// Deterministic, code-level enforcement of the rules that prompt instructions alone
// could not reliably hold (this is the exact lesson from the existing n8n system:
// "no em dashes" and "exclude suppressed companies" both leaked through prompts
// until they were enforced here, in code, after the LLM call). Nothing in this file
// calls an LLM. Everything is a pure function, cheap to unit test.

export function norm(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function normName(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
}

export function normDomain(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

/** Fuzzy suppression filter: catches subsidiaries/sites of an existing customer,
 * e.g. "Anglo American - Minas-Rio" must be excluded by a suppression entry of
 * just "Anglo American". This was a real bug in the existing system caught by
 * cross-checking real pipeline output against the suppression list. */
export function isSuppressed(companyName: string, suppression: string[]): boolean {
  const name = norm(companyName);
  return suppression.map(norm).filter(Boolean).some((s) => name.includes(s));
}

/** Confirms a LinkedIn URL is a real personal profile, not a company page or a
 * search-results link. */
export function isValidLinkedInProfile(url: string | null | undefined): boolean {
  return /linkedin\.com\/in\//i.test(String(url ?? ""));
}

export function linkedInHandle(url: string | null | undefined): string {
  const m = String(url ?? "")
    .toLowerCase()
    .match(/linkedin\.com\/in\/([^/?#]+)/);
  return m ? m[1] : "";
}

/** Confirms an account's operations are in Latin America by checking actual
 * operational evidence (named sites, ops/scale text), NOT headquarters country.
 * Several major miners are HQ'd abroad but mine in the region; filtering by HQ
 * would wrongly exclude them. */
const LATAM_COUNTRIES = [
  "chile", "peru", "brazil", "brasil", "argentina", "mexico", "méxico",
  "colombia", "bolivia", "ecuador", "venezuela", "guatemala", "panama",
  "uruguay", "paraguay",
];

export function confirmsLatamOperations(input: {
  latamSites?: string;
  opsEvidence?: string;
  scaleEvidence?: string;
  hqCountry?: string;
}): boolean {
  if (String(input.latamSites ?? "").trim()) return true;
  const blob = norm(
    `${input.opsEvidence ?? ""} ${input.scaleEvidence ?? ""} ${input.hqCountry ?? ""}`
  );
  return LATAM_COUNTRIES.some((c) => blob.includes(c));
}

/** Deterministic em/en dash remover. Runs AFTER any LLM generation step, so no
 * dash survives into a final email regardless of what the model actually wrote.
 * Prompt-level "no em dashes" instructions were empirically unreliable, this
 * guarantees it instead of hoping for it. */
export function stripEmDashes(input: string | null | undefined): string {
  if (input == null) return "";
  return String(input)
    .replace(/\s*[—–―]\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/[ \t]{2,}/g, " ");
}

/** Splits a full name into first/last for use against email-finder APIs. */
export function splitName(fullName: string): { first: string; last: string } {
  const parts = String(fullName ?? "").trim().split(/\s+/);
  return {
    first: parts[0] ?? "",
    last: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}
