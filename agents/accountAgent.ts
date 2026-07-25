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
  scale_evidence: string;
  ops_evidence: string;
  why_fit_vs_anchor: string;
  icp_score: number;
  ownership_flags: string;
  sources: string[];
}

const SEGMENTS = ["lithium", "copper", "iron ore"];

export async function findAccounts(
  runId: string,
  brief: CampaignBrief,
  deps: AccountAgentDeps
): Promise<Account[]> {
  const perSegment = await Promise.all(
    SEGMENTS.map(async (segment) => {
      const prompt = buildFinderPrompt(segment, brief);
      const { text, sourceUrls } = await webSearch({ apiKey: deps.openaiApiKey, model: deps.model, input: prompt });
      const structured = await structuredCall<{ accounts: RawAccount[] }>({
        apiKey: deps.openaiApiKey,
        model: deps.model,
        input: buildStructuringPrompt(text, sourceUrls, brief),
        schema: ACCOUNT_SCHEMA,
        schemaName: "accounts",
      });
      return structured.accounts;
    })
  );

  const merged: Account[] = perSegment.flat().map((r) => ({
    runId,
    company: r.company,
    domain: normDomain(r.domain),
    hqCountry: r.hq_country,
    latamSites: r.latam_sites,
    commodity: r.commodity,
    scaleEvidence: r.scale_evidence,
    opsEvidence: r.ops_evidence,
    whyFitVsAnchor: r.why_fit_vs_anchor,
    icpScore: r.icp_score,
    ownershipFlags: r.ownership_flags,
    sources: r.sources ?? [],
    geoOk: confirmsLatamOperations({
      latamSites: r.latam_sites,
      opsEvidence: r.ops_evidence,
      scaleEvidence: r.scale_evidence,
      hqCountry: r.hq_country,
    }),
  }));

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
