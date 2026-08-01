// Ported from "Build Finder Prompts" + "Merge Finder Results" in the existing
// n8n pipeline. The ICP is derived inline from the SQM anchor; SQM itself is
// never a form input here, it must stay hardcoded so the benchmark cannot drift.
import type { CampaignBrief } from "../agents/types.js";

export const ANCHOR_COMPANY = "Sociedad Quimica y Minera de Chile (SQM)";

/** Weights used to score every candidate account against SQM.
 *
 * Revised 2026-08-01. The previous version had a single `scale: 0.4` as the
 * heaviest weight, and the finder prompt asked for "annual production, revenue,
 * or workforce" to fill it. That measures COMPANY SIZE, which is not what made
 * SQM a good account. What made SQM work was 678 km2 of dispersed site with
 * leaching piles 250 x 500 m each, not US$4.6bn of revenue. Those two things
 * come apart badly: a huge company running a compact underground mine scores
 * high and is a poor target (nothing dispersed to inspect from the air), while
 * a mid-size operator with a sprawling heap-leach operation scores low and is a
 * strong one.
 *
 * So `scale` is split. `inspectableArea` now carries the heaviest weight and
 * measures dispersed physical footprint; `companyScale` is retained at a much
 * lower weight because it still says something real about budget and ability to
 * buy, just far less than the footprint does. */
export const ICP_WEIGHTS = {
  inspectableArea: 0.3,
  hazardAnd247Ops: 0.25,
  companyScale: 0.15,
  geography: 0.15,
  techAdoption: 0.15,
} as const;

export function buildFinderPrompt(segment: string, brief: CampaignBrief): string {
  const icp = `Anchor company (ICP benchmark): ${ANCHOR_COMPANY}
Target vertical: ${brief.vertical}
What FlytBase sells: ${brief.angle}
We want to book: ${brief.goal}
An ideal account resembles the anchor most of all in DISPERSED PHYSICAL FOOTPRINT (the anchor's operation covers 678 km2 with individual leaching piles 250 x 500 m each, and that dispersion, not the company's revenue, is what makes aerial inspection worth doing), plus hazardous / 24-7 operations, Latin American geography, and reliance on contracted inspection crews walking or driving the site.`;
  return `Using this ICP:\n${icp}\n\nSearch the web and list 5-6 REAL ${segment} companies with major operations in Latin America that resemble this profile. Prioritise operators whose sites are physically LARGE AND DISPERSED (sprawling open pits, heap-leach or leach-pad operations, evaporation ponds, tailings areas, long conveyor or pipeline runs, many separated sites) over operators that are merely large as companies. A compact underground mine is a poor match even at high revenue; a mid-size operator with a sprawling surface footprint is a strong one.\n\nFor each company give: HQ country, named Latin American operating sites, evidence of the physical site footprint (site area in km2 or hectares, number of separate/dispersed sites, or the scale of leach pads / ponds / pit area - whatever the sources actually state), one verifiable company-scale figure (annual production, revenue, or workforce), evidence of 24/7 or hazardous operations, and recent expansion or technology signals. Only include companies you can support with real sources. Exclude ${brief.suppression.join(", ")} as primary targets, but note joint ventures involving them.`;
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
          "site_area_evidence", "scale_evidence", "ops_evidence",
          "why_fit_vs_anchor", "icp_score", "ownership_flags", "sources",
        ],
        properties: {
          company: { type: "string" },
          domain: { type: "string" },
          hq_country: { type: "string" },
          latam_sites: { type: "string" },
          commodity: { type: "string" },
          site_area_evidence: { type: "string" },
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
  return `Extract every company from the research below into the JSON schema. icp_score 1-10 = similarity to the anchor company ${ANCHOR_COMPANY}, weighted: dispersed inspectable site footprint ${ICP_WEIGHTS.inspectableArea * 100}% (the heaviest single factor - the anchor's operation is 678 km2 of dispersed surface area, and that is what makes aerial inspection valuable, NOT company size), hazard and 24/7 operations ${ICP_WEIGHTS.hazardAnd247Ops * 100}%, company scale ${ICP_WEIGHTS.companyScale * 100}%, geography ${ICP_WEIGHTS.geography * 100}%, technology-adoption signals ${ICP_WEIGHTS.techAdoption * 100}%. A company that is large by revenue but runs a compact or underground operation should score LOW; a mid-size operator with a sprawling surface footprint (heap leach pads, evaporation ponds, large open pits, many dispersed sites) should score HIGH. Set site_area_evidence to whatever the research actually states about physical footprint - site area in km2 or hectares, number of separate sites, or the scale of leach pads / ponds / pit area - and use an empty string if the research states none, do not estimate or infer it. Set scale_evidence to the company-size figure (production, revenue, or workforce). Set latam_sites to the company's named Latin American operating site(s) with country; empty string if the research names none. Set ownership_flags to a short note if any of [${brief.suppression.join(", ")}] owns or part-owns the company, else an empty string. Set domain to the company's official primary website domain, lowercase, no protocol or path; empty string if you cannot verify it. For each company, set "sources" to the URL(s) from the SOURCE URLS list below that back up its scale or operations claims; use ONLY URLs from that list, never invent a URL, and use an empty array if none clearly apply. Use an empty string for any unknown text field.\n\nRESEARCH:\n${researchText}\n\nSOURCE URLS (use only these in "sources"):\n${sourceUrls.map((u) => `- ${u}`).join("\n") || "(none returned)"}`;
}
