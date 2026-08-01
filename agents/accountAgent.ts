// Ported from "Build Finder Prompts" + "Merge Finder Results" in the existing
// n8n pipeline: web-search for candidate accounts per segment, structure the
// prose into schema, then apply every deterministic guardrail (suppression,
// geography-by-operations, domain dedup, source requirement) in code, not in
// the prompt. This agent owns Stage 1 of the pipeline: turning a campaign
// brief into a scored, deduped account list.
import type { Account, CampaignBrief } from "./types.js";
import { webSearch, structuredCall } from "../tools/openai.js";
import { isSuppressed, confirmsLatamOperations, normDomain } from "../tools/textGuards.js";
import { buildFinderPrompt, buildStructuringPrompt, ACCOUNT_SCHEMA } from "../skills/icpScoring.js";

export interface AccountAgentDeps {
  openaiApiKey: string;
  model?: string;
}

interface RawAccount {
  company: string;
  domain: string;
  hq_country: string;
  latam_sites: string;
  commodity: string;
  site_area_evidence: string;
  scale_evidence: string;
  ops_evidence: string;
  why_fit_vs_anchor: string;
  icp_score: number;
  ownership_flags: string;
  sources: string[];
}

const DEFAULT_SEGMENTS = ["lithium", "copper", "iron ore"];

/** Noise words that appear in a vertical description but are not themselves a
 * searchable segment ("large-scale mining operations in Latin America" should
 * not produce a "large-scale" segment). */
const VERTICAL_STOPWORDS = new Set([
  "large", "scale", "large-scale", "small", "mid", "sized", "operations", "operation",
  "mining", "mines", "mine", "and", "or", "in", "the", "of", "for", "with", "across",
  "companies", "company", "producers", "producer", "sector", "industry", "latin",
  "america", "american", "latam", "global", "major", "leading",
]);

/** Derives the commodity/segment list to search from the brief's own vertical
 * text, instead of a hardcoded list. Before this, changing the vertical in the
 * UI (which defaultBrief.ts explicitly advertises as overridable) had no effect
 * at all on what the finder actually searched for - it always searched lithium,
 * copper and iron ore. Falls back to the default trio when the vertical yields
 * nothing usable, so a vague or empty vertical still runs the tuned default
 * campaign rather than searching for nothing. */
export function deriveSegments(vertical: string): string[] {
  const cleaned = String(vertical ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s,/&-]/g, " ");

  // Split on connectors people actually use in a vertical description.
  const candidates = cleaned
    .split(/,|\/|\band\b|\bor\b|&/)
    .map((part) =>
      part
        .split(/\s+/)
        .filter((word) => word && !VERTICAL_STOPWORDS.has(word))
        .join(" ")
        .trim()
    )
    .filter((part) => part.length > 2);

  const unique = [...new Set(candidates)];
  return unique.length ? unique.slice(0, 4) : DEFAULT_SEGMENTS;
}

export async function findAccounts(
  runId: string,
  brief: CampaignBrief,
  deps: AccountAgentDeps
): Promise<Account[]> {
  const segments = deriveSegments(brief.vertical);
  const perSegment = await Promise.all(
    segments.map(async (segment) => {
      const prompt = buildFinderPrompt(segment, brief);
      const { text, sourceUrls } = await webSearch({ apiKey: deps.openaiApiKey, model: deps.model, input: prompt });
      const structured = await structuredCall<{ accounts: RawAccount[] }>({
        apiKey: deps.openaiApiKey,
        model: deps.model,
        input: buildStructuringPrompt(text, sourceUrls, brief),
        schema: ACCOUNT_SCHEMA,
        schemaName: "accounts",
      });
      return { accounts: structured.accounts, allowedSources: new Set(sourceUrls) };
    })
  );

  const merged: Account[] = perSegment.flatMap(({ accounts, allowedSources }) => accounts.map((r) => ({
    runId,
    company: r.company,
    domain: normDomain(r.domain),
    hqCountry: r.hq_country,
    latamSites: r.latam_sites,
    commodity: r.commodity,
    siteAreaEvidence: r.site_area_evidence ?? "",
    scaleEvidence: r.scale_evidence,
    opsEvidence: r.ops_evidence,
    whyFitVsAnchor: r.why_fit_vs_anchor,
    icpScore: r.icp_score,
    ownershipFlags: r.ownership_flags,
    // Deterministic provenance gate: a syntactically valid URL is not enough;
    // it must be one the grounded search actually returned in this call.
    sources: (r.sources ?? []).filter((source) => allowedSources.has(source)),
    geoOk: confirmsLatamOperations({
      latamSites: r.latam_sites,
      opsEvidence: r.ops_evidence,
      scaleEvidence: r.scale_evidence,
      hqCountry: r.hq_country,
    }),
  })));

  const filtered = merged.filter(
    (a) => a.company && a.sources.length > 0 && a.geoOk && !isSuppressed(a.company, brief.suppression)
  );

  const seenDomains = new Set<string>();
  const deduped = filtered.filter((a) => {
    const key = a.domain || a.company.toLowerCase();
    if (seenDomains.has(key)) return false;
    seenDomains.add(key);
    return true;
  });

  return deduped.sort((a, b) => b.icpScore - a.icpScore).slice(0, brief.maxAccounts);
}
