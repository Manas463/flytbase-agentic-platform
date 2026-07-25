// Grounded account research. Every claim-level evidence item is checked
// against URLs actually returned by web search before it enters Shared Memory.
import type { Account, EvidenceGap, ResearchBrief, ResearchEvidence } from "./types.js";
import { webSearch, structuredCall } from "../tools/openai.js";

export interface ResearchAgentDeps {
  openaiApiKey: string;
  model?: string;
}

const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "recent_news",
    "operational_footprint",
    "tech_or_expansion_signals",
    "hazard_and_247_context",
    "contracted_crew_context",
    "best_hook",
    "best_hook_source",
    "evidence",
  ],
  properties: {
    recent_news: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "item", "source_url"],
        properties: { date: { type: "string" }, item: { type: "string" }, source_url: { type: "string" } },
      },
    },
    operational_footprint: { type: "string" },
    tech_or_expansion_signals: { type: "array", items: { type: "string" } },
    hazard_and_247_context: { type: "string" },
    contracted_crew_context: { type: "string" },
    best_hook: { type: "string" },
    best_hook_source: { type: "string" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dimension", "claim", "source_url"],
        properties: {
          dimension: {
            type: "string",
            enum: [
              "scale",
              "operations",
              "hazard_247",
              "contracted_crews",
              "technology",
              "expansion",
              "personalization_hook",
            ],
          },
          claim: { type: "string" },
          source_url: { type: "string" },
        },
      },
    },
  },
} as const;

interface RawResearch {
  recent_news: { date: string; item: string; source_url: string }[];
  operational_footprint: string;
  tech_or_expansion_signals: string[];
  hazard_and_247_context: string;
  contracted_crew_context: string;
  best_hook: string;
  best_hook_source: string;
  evidence: { dimension: ResearchEvidence["dimension"]; claim: string; source_url: string }[];
}

function buildResearchPrompt(account: Account): string {
  return `Research ${account.company} for a personalized cold outbound email. We already know: HQ ${account.hqCountry}, Latin American sites: ${account.latamSites || "not yet named"}, commodity ${account.commodity}, prior scale evidence: ${account.scaleEvidence}.

Find and report, with a real source URL for each:
1. Recent news (last 12 months): expansions, incidents, technology adoption, leadership changes, earnings signals.
2. Operational footprint detail: named sites, terrain, workforce size if available.
3. Technology or expansion signals: automation, drone, digitalization, or new-site announcements.
4. Hazardous / 24-7 operations context: shift patterns, safety incidents, regulatory pressure.
5. Evidence they use contracted inspection/survey crews.
6. The single best, specific, citable hook for an opening line.
7. Claim-level evidence for every useful finding, categorized by dimension, with its exact supporting URL.

Only report what you can support with a real, current source. Say plainly when a category has no findings; do not fill gaps with generic industry statements.`;
}

function buildStructuringPrompt(researchText: string, sourceUrls: string[]): string {
  return `Extract the research below into the JSON schema. For recent_news items, best_hook_source, and every evidence.source_url, use ONLY URLs from the SOURCE URLS list; never invent a URL. Each evidence item must contain one specific claim actually supported by its URL. Use an empty string/array for any category with no real findings; do not backfill with generic statements.

RESEARCH:
${researchText}

SOURCE URLS:
${sourceUrls.map((url) => `- ${url}`).join("\n") || "(none returned)"}`;
}

async function runResearch(account: Account, prompt: string, deps: ResearchAgentDeps): Promise<ResearchBrief> {
  const { text, sourceUrls } = await webSearch({
    apiKey: deps.openaiApiKey,
    model: deps.model,
    input: prompt,
  });
  const structured = await structuredCall<RawResearch>({
    apiKey: deps.openaiApiKey,
    model: deps.model,
    input: buildStructuringPrompt(text, sourceUrls),
    schema: RESEARCH_SCHEMA,
    schemaName: "research",
  });

  const allowedSources = new Set(sourceUrls);
  const evidence = structured.evidence
    .filter((item) => item.claim.trim() && allowedSources.has(item.source_url))
    .map((item) => ({ dimension: item.dimension, claim: item.claim, sourceUrl: item.source_url }));
  const recentNews = structured.recent_news
    .filter((item) => allowedSources.has(item.source_url))
    .map((item) => ({ date: item.date, item: item.item, sourceUrl: item.source_url }));
  const bestHookSource = allowedSources.has(structured.best_hook_source) ? structured.best_hook_source : "";

  return {
    accountId: account.id ?? "",
    company: account.company,
    recentNews,
    operationalFootprint: structured.operational_footprint,
    techOrExpansionSignals: structured.tech_or_expansion_signals,
    hazardAnd247Context: structured.hazard_and_247_context,
    contractedCrewContext: structured.contracted_crew_context,
    bestHook: bestHookSource ? structured.best_hook : "",
    bestHookSource,
    sources: [...new Set([...sourceUrls, bestHookSource, ...recentNews.map((item) => item.sourceUrl)])].filter(Boolean),
    evidence,
  };
}

export async function researchAccount(account: Account, deps: ResearchAgentDeps): Promise<ResearchBrief> {
  return runResearch(account, buildResearchPrompt(account), deps);
}

function mergeResearch(current: ResearchBrief, additional: ResearchBrief): ResearchBrief {
  const newsKey = (item: ResearchBrief["recentNews"][number]) => `${item.sourceUrl}|${item.item}`;
  const evidenceKey = (item: ResearchEvidence) => `${item.dimension}|${item.sourceUrl}|${item.claim}`;
  const news = new Map(current.recentNews.map((item) => [newsKey(item), item]));
  const evidence = new Map(current.evidence.map((item) => [evidenceKey(item), item]));
  for (const item of additional.recentNews) news.set(newsKey(item), item);
  for (const item of additional.evidence) evidence.set(evidenceKey(item), item);

  const hasFinding = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return Boolean(normalized) && !["not found", "no evidence", "could not verify", "unknown"].some((marker) => normalized.includes(marker));
  };

  return {
    ...current,
    recentNews: [...news.values()],
    operationalFootprint: hasFinding(additional.operationalFootprint) ? additional.operationalFootprint : current.operationalFootprint,
    techOrExpansionSignals: [...new Set([...current.techOrExpansionSignals, ...additional.techOrExpansionSignals])],
    hazardAnd247Context: hasFinding(additional.hazardAnd247Context) ? additional.hazardAnd247Context : current.hazardAnd247Context,
    contractedCrewContext: hasFinding(additional.contractedCrewContext) ? additional.contractedCrewContext : current.contractedCrewContext,
    bestHook: hasFinding(additional.bestHook) ? additional.bestHook : current.bestHook,
    bestHookSource: hasFinding(additional.bestHook) ? additional.bestHookSource : current.bestHookSource,
    sources: [...new Set([...current.sources, ...additional.sources])],
    evidence: [...evidence.values()],
  };
}

export async function researchAccountGaps(
  account: Account,
  current: ResearchBrief,
  gaps: EvidenceGap[],
  deps: ResearchAgentDeps
): Promise<ResearchBrief> {
  const researchGaps = gaps.filter((gap) => gap.owner === "research_agent");
  if (!researchGaps.length) return current;
  const questions = researchGaps.map((gap, index) => `${index + 1}. [${gap.id}] ${gap.researchQuestion}`).join("\n");
  const prompt = `Run a targeted follow-up investigation for ${account.company}. The first pass was insufficient in these exact areas:
${questions}

Existing sources (do not merely repeat them):
${current.sources.map((source) => `- ${source}`).join("\n") || "(none)"}

Search for new, real public evidence that closes these gaps. Prefer company filings, regulator or government records, official site/project pages, and reputable reporting. Return only claims backed by a URL surfaced by this search. If a gap cannot be resolved, say so; never infer or fabricate a claim.`;
  const additional = await runResearch(account, prompt, deps);
  return mergeResearch(current, additional);
}
