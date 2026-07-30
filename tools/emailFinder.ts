// Ported directly from the existing n8n "Resolve Email (Waterfall)" node.
// The model never writes an email address itself. This tool resolves one, for
// one already-verified contact, using real data providers, or returns not_found
// honestly. Order is credit-optimized for the free tiers: Prospeo has the most
// free credits so it runs first; Hunter is the fallback plus domain search and
// verification.
import { splitName } from "./textGuards.js";

export interface EmailResolution {
  email: string;
  source: "hunter_domain_search" | "prospeo" | "hunter_email_finder" | "not_found";
  confidence: number | null;
  status: string;
  companyDomain: string;
  emailVerifiedStatus: string;
}

interface Keys {
  prospeoKey: string;
  hunterKey: string;
  verify?: boolean; // set false to skip verification and conserve Hunter credits
}

const domainCache = new Map<string, { domain: string; emails: HunterDomainEmail[] }>();

interface HunterDomainEmail {
  value: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  department?: string;
  confidence?: number;
}

async function resolveDomain(company: string, accountDomain: string, hunterKey: string) {
  if (accountDomain) return { domain: accountDomain, emails: [] as HunterDomainEmail[] };
  if (domainCache.has(company)) return domainCache.get(company)!;
  let out = { domain: "", emails: [] as HunterDomainEmail[] };
  if (hunterKey && company) {
    try {
      const url = `https://api.hunter.io/v2/domain-search?company=${encodeURIComponent(
        company
      )}&api_key=${hunterKey}&limit=25`;
      const res = await fetch(url);
      const json = await res.json();
      if (json?.data) out = { domain: json.data.domain ?? "", emails: json.data.emails ?? [] };
    } catch {
      /* leave out empty; downstream will try Prospeo instead */
    }
  }
  domainCache.set(company, out);
  return out;
}

function matchFromHunterDomain(
  emails: HunterDomainEmail[],
  first: string,
  last: string,
  title: string
): EmailResolution | null {
  const lc = last.toLowerCase();
  const fc = first.toLowerCase();
  const titleWords = title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  let best: HunterDomainEmail | undefined;
  for (const e of emails) {
    const eLast = (e.last_name ?? "").toLowerCase();
    const eFirst = (e.first_name ?? "").toLowerCase();
    const pos = `${e.position ?? ""} ${e.department ?? ""}`.toLowerCase();
    if (lc && eLast && eLast === lc) { best = e; break; }
    if (!best && fc && eFirst && eFirst === fc) best = e;
    if (!best && titleWords.some((w) => pos.includes(w))) best = e;
  }
  return best
    ? {
        email: best.value,
        source: "hunter_domain_search",
        confidence: best.confidence ?? null,
        status: "from_domain_index",
        companyDomain: "",
        emailVerifiedStatus: "",
      }
    : null;
}

/** Prospeo removed the old /email-finder endpoint entirely (confirmed live:
 * it now returns {"error_code":"DEPRECATED"}). Replaced with /enrich-person,
 * verified against a real call for a real contact (Carlos Medeiros, Vale)
 * before trusting the shape below - the email lives at person.email.email,
 * gated by person.email.revealed. Prospeo's own person.email.status
 * ("VERIFIED" when it did its own bounce-check) is carried through as
 * emailVerifiedStatus, so resolveEmail() below can skip an extra Hunter
 * verify() call when Prospeo already confirmed deliverability. */
async function tryProspeo(
  first: string,
  last: string,
  domain: string,
  prospeoKey: string
): Promise<EmailResolution | null> {
  if (!prospeoKey || !domain) return null;
  try {
    const res = await fetch("https://api.prospeo.io/enrich-person", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-KEY": prospeoKey },
      body: JSON.stringify({ data: { first_name: first, last_name: last, company_website: domain } }),
    });
    const json = await res.json();
    if (json?.error) return null;
    const emailInfo = json?.person?.email;
    if (!emailInfo?.revealed || typeof emailInfo.email !== "string" || !emailInfo.email) return null;
    return {
      email: emailInfo.email,
      source: "prospeo",
      confidence: null,
      status: emailInfo.status ?? "prospeo",
      companyDomain: domain,
      emailVerifiedStatus: emailInfo.status === "VERIFIED" ? "valid" : "",
    };
  } catch {
    return null;
  }
}

async function tryHunterFinder(
  first: string,
  last: string,
  domain: string,
  hunterKey: string
): Promise<EmailResolution | null> {
  if (!hunterKey || !domain) return null;
  try {
    const url = `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${encodeURIComponent(
      first
    )}&last_name=${encodeURIComponent(last)}&api_key=${hunterKey}`;
    const res = await fetch(url);
    const json = await res.json();
    const email = json?.data?.email;
    return email
      ? { email, source: "hunter_email_finder", confidence: json.data.score ?? null, status: "hunter", companyDomain: domain, emailVerifiedStatus: "" }
      : null;
  } catch {
    return null;
  }
}

async function verify(email: string, hunterKey: string): Promise<string> {
  if (!hunterKey || !email) return "";
  try {
    const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(
      email
    )}&api_key=${hunterKey}`;
    const res = await fetch(url);
    const json = await res.json();
    return json?.data?.status ?? json?.data?.result ?? "";
  } catch {
    return "";
  }
}

/** Resolve one contact's email. Only ever call this on a contact that already
 * passed role-fit + source verification, this tool is the last step, not a
 * discovery step, it never invents a candidate to search for. */
export async function resolveEmail(
  contact: { name: string; title: string },
  account: { company: string; domain?: string },
  keys: Keys
): Promise<EmailResolution> {
  const { first, last } = splitName(contact.name);
  const dom = await resolveDomain(account.company, account.domain ?? "", keys.hunterKey);
  const domain = dom.domain || account.domain || "";

  let hit: EmailResolution | null = null;
  if (dom.emails.length) hit = matchFromHunterDomain(dom.emails, first, last, contact.title);
  if (!hit) hit = await tryProspeo(first, last, domain, keys.prospeoKey);
  if (!hit) hit = await tryHunterFinder(first, last, domain, keys.hunterKey);

  // Skip the Hunter verify call entirely if Prospeo already confirmed the
  // email itself (saves a Hunter credit, and matters in practice right now
  // since Hunter's monthly search quota is exhausted - confirmed via a live
  // 429 "too_many_requests" from the account, not assumed).
  const emailVerifiedStatus =
    hit?.emailVerifiedStatus === "valid"
      ? hit.emailVerifiedStatus
      : keys.verify !== false && hit
        ? await verify(hit.email, keys.hunterKey)
        : "";

  if (!hit) {
    return {
      email: "",
      source: "not_found",
      confidence: null,
      status: "not_found",
      companyDomain: domain,
      emailVerifiedStatus: "",
    };
  }
  return { ...hit, companyDomain: domain, emailVerifiedStatus };
}
