// Ported from "Build Finder Prompts" + "Merge Finder Results" in the existing
// n8n pipeline. The ICP is derived inline from the SQM anchor; SQM itself is
// never a form input here, it must stay hardcoded so the benchmark cannot drift.
import type { CampaignBrief } from "../agents/types.js";

export const ANCHOR_COMPANY = "Sociedad Quimica y Minera de Chile (SQM)";

/** Weights used to score every candidate account against SQM. Keep these in
 * sync with Merge Finder Results if you ever revisit them, they were tuned
 * deliberately: scale matters most, then hazardous 24/7 operations, then
 * geography, then technology adoption as a tiebreaker. */
export const ICP_WEIGHTS = {
  scale: 0.4,
  hazardAnd247Ops: 0.3,
  geography: 0.2,
  techAdoption: 0.1,
} as const;

export function buildFinderPrompt(segment: string, brief: CampaignBrief): string {
  const icp = `Anchor company (ICP benchmark): ${ANCHOR_COMPANY}
Target vertical: ${brief.vertical}
What FlytBase sells: ${brief.angle}
We want to book: ${brief.goal}
An ideal account resembles the anchor in scale, hazardous / 24-7 operations, Latin American geography, and reliance on contracted inspection crews.`;
  return `Using this ICP:\n${icp}\n\nSearch the web and list 5-6 REAL ${segment} mining companies with major operations in Latin America that resemble this profile in scale, operations, and geography. For each give: HQ country, named Latin American operating sites, one verifiable scale figure (annual production, revenue, or workforce), evidence of 24/7 or hazardous operations, and recent expansion or technology signals. Only include companies you can support with real sources. Exclude ${brief.suppression.join(", ")} as primary targets, but note joint ventures involving them.`;
}

export const ACCOUNT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["accounts"],
  properties: {
    accounts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "company", "domain", "hq_country", "latam_sites", "commodity",
          "scale_evidence", "ops_evidence", "why_fit_vs_anchor", "icp_score",
          "ownership_flags", "sources",
        ],
        properties: {
          company: { type: "string" },
          domain: { type: "string" },
          hq_country: { type: "string" },
          latam_sites: { type: "string" },
          commodity: { type: "string" },
          scale_evidence: { type: "string" },
          ops_evidence: { type: "string" },
          why_fit_vs_anchor: { type: "string" },
          icp_score: { type: "integer" },
          ownership_flags: { type: "string" },
          sources: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export function buildStructuringPrompt(researchText: string, sourceUrls: string[], brief: CampaignBrief): string {
  return `Extract every company from the research below into the JSON schema. icp_score 1-10 = similarity to the anchor company ${ANCHOR_COMPANY} (scale ${ICP_WEIGHTS.scale * 100}%, hazard and 24/7 operations ${ICP_WEIGHTS.hazardAnd247Ops * 100}%, geography ${ICP_WEIGHTS.geography * 100}%, technology-adoption signals ${ICP_WEIGHTS.techAdoption * 100}%). Set latam_sites to the company's named Latin American operating site(s) with country; empty string if the research names none. Set ownership_flags to a short note if any of [${brief.suppression.join(", ")}] owns or part-owns the company, else an empty string. Set domain to the company's official primary website domain, lowercase, no protocol or path; empty string if you cannot verify it. For each company, set "sources" to the URL(s) from the SOURCE URLS list below that back up its scale or operations claims; use ONLY URLs from that list, never invent a URL, and use an empty array if none clearly apply. Use an empty string for any unknown text field.\n\nRESEARCH:\n${researchText}\n\nSOURCE URLS (use only these in "sources"):\n${sourceUrls.map((u) => `- ${u}`).join("\n") || "(none returned)"}`;
}
