// Ported from "Build Contacts Prompt" + "Parse Contacts" in the existing n8n
// pipeline. Four role families, not three, per the real evidence from FlytBase's
// own SQM case study: the actual champion who drove that deployment was a
// Digital Transformation Lead, a role the original brief never named. Keep this
// fourth family, it is not a guess.
import type { Contact, RoleFamily } from "../agents/types.js";
import { norm, normName, linkedInHandle, isValidLinkedInProfile } from "../tools/textGuards.js";

export const TARGET_TITLES = [
  "Head of Operations / VP Operations / Gerente de Operaciones",
  "VP HSE / Head of HSE / Gerente HSE",
  "Site Director / Site General Manager / Gerente General de Faena",
  "Digital Transformation Lead / Head of Innovation / Chief Technology Officer / Gerente de Transformacion Digital",
];

export const FIT_ROLES: RoleFamily[] = ["operations", "hse", "site", "digital_transformation"];

export const CONTACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["contacts"],
  properties: {
    contacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "title", "seniority", "role_match", "linkedin_url", "evidence_source", "notes"],
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          seniority: { type: "string" },
          role_match: { type: "string", enum: ["operations", "hse", "site", "digital_transformation", "other"] },
          linkedin_url: { type: "string" },
          evidence_source: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
  },
} as const;

export function buildContactsPrompt(opts: {
  company: string;
  execSearchText: string;
  linkedinResults: { title: string; url: string; snippet: string }[];
  contactsPerAccount: number;
}): string {
  const li = opts.linkedinResults.map((r) => `${r.title} | ${r.url} | ${r.snippet}`).join("\n");
  return `Merge these findings into a contact list for ${opts.company}.\n\nSTRICT RULES:\n1. SOURCE: include a person ONLY if a source URL supports their name AND role; put that URL in evidence_source. Never invent anyone.\n2. ROLE FIT: include a person ONLY if their role maps to one of these families - operations leadership (Head/VP/Director of Operations, Gerente de Operaciones), HSE/safety leadership (VP/Head/Director of HSE, SSMA, Safety), site leadership (Site Director, General Manager, Gerente General de Faena), or digital transformation leadership (Digital Transformation Lead, Head of Innovation, CTO, Gerente de Transformacion Digital). Set role_match to "operations", "hse", "site", or "digital_transformation" accordingly. If a well-sourced person does NOT fit these families, set role_match to "other" (it will be filtered out).\n3. Do not include email addresses. Use an empty string for any unknown field.\n4. Return at most ${opts.contactsPerAccount} people who FIT the families above; return an empty list if none are both verifiable and role-fitting.\n\nTARGET TITLES: ${TARGET_TITLES.join("; ")}\n\nWEB RESEARCH FINDINGS:\n${opts.execSearchText}\n\nLINKEDIN SEARCH RESULTS (title | url | snippet):\n${li || "(none found)"}`;
}

function siteScore(contact: Pick<Contact, "title" | "notes">, latamSites: string): number {
  const sites = norm(latamSites);
  if (!sites) return 0;
  const siteWords = sites.split(" ").filter((w) => w.length > 3);
  const hay = norm(`${contact.title} ${contact.notes}`);
  return siteWords.some((w) => hay.includes(w)) ? 1 : 0;
}

/** Enforces role-fit deterministically (drops anything the model tagged "other"),
 * dedupes, and picks up to N contacts MAXIMIZING role-family diversity
 * (multi-threading, one Ops-or-Site person plus one HSE-or-Digital-Transformation
 * person, rather than two people who'd have the same conversation), with
 * site-specificity as the tiebreaker. This is the real gatekeeper, not the
 * prompt above, the prompt is guidance, this is enforcement. */
export function selectContacts(
  rawContacts: Contact[],
  contactsPerAccount: number,
  latamSites: string
): Contact[] {
  let contacts = rawContacts.filter((c) => FIT_ROLES.includes(c.roleMatch));

  const seen = new Set<string>();
  contacts = contacts.filter((c) => {
    const key = linkedInHandle(c.linkedinUrl) || normName(c.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  contacts = contacts.map((c) => ({ ...c, linkedinValid: isValidLinkedInProfile(c.linkedinUrl) }));

  const scored = contacts
    .map((c) => ({ c, site: siteScore(c, latamSites) }))
    .sort((a, b) => b.site - a.site);

  const picked: Contact[] = [];
  const usedRoles = new Set<RoleFamily>();
  for (const { c } of scored) {
    if (picked.length >= contactsPerAccount) break;
    if (!usedRoles.has(c.roleMatch)) {
      picked.push(c);
      usedRoles.add(c.roleMatch);
    }
  }
  if (picked.length < contactsPerAccount) {
    for (const { c } of scored) {
      if (picked.length >= contactsPerAccount) break;
      if (!picked.includes(c)) picked.push(c);
    }
  }
  return picked;
}
