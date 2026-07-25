// Ported from the account-level research step in the existing n8n pipeline
// (the deep-dive that used to run right after Stage 1 scoring, before feeding
// Stage 2 contact search and the email writer). Grounded web search only,
// every claim must carry a source URL, never fall back to model memory.
import type { Account, ResearchBrief } from "./types.js";
import { webSearch, structuredCall } from "../tools/openai.js";

export interface ResearchAgentDeps {
  openaiApiKey: string;
  model?: string;
}

const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "recent_news", "operational_footprint", "tech_or_expansion_signals",
    "hazard_and_247_context", "contracted_crew_context", "best_hook", "best_hook_source",
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
}

function buildResearchPrompt(account: Account): string {
  return `Research ${account.company} for a personalized cold outbound email. We already know: HQ ${account.hqCountry}, Latin American sites: ${account.latamSites || "not yet named"}, commodity ${account.commodity}, prior scale evidence: ${account.scaleEvidence}.\n\nFind and report, with a real source URL for each:\n1. Recent news (last 12 months): expansions, incidents, technology adoption, leadership changes, earnings signals.\n2. Operational footprint detail: named sites, terrain, workforce size if available.\n3. Technology or expansion signals: automation, drone, digitalization, or new-site announcements.\n4. Hazardous / 24-7 operations context: shift patterns, safety incidents, regulatory pressure.\n5. Evidence they use contracted inspection/survey crews (a cost FlytBase's own drone-in-a-box product replaces).\n6. The single BEST, most specific, most citable hook for an opening line, plus its source URL.\n\nOnly report what you can support with a real, current source. Say so plainly if a category has no findings, do not fill gaps with generic industry statements.`;
}

function buildStructuringPrompt(researchText: string, sourceUrls: string[]): string {
  return `Extract the research below into the JSON schema. For recent_news items and best_hook_source, use ONLY URLs from the SOURCE URLS list; never invent a URL. Use an empty string/array for any category with no real findings, do not backfill with generic statements.\n\nRESEARCH:\n${researchText}\n\nSOURCE URLS:\n${sourceUrls.map((u) => `- ${u}`).join("\n") || "(none returned)"}`;
}

export async function researchAccount(account: Account, deps: ResearchAgentDeps): Promise<ResearchBrief> {
  const { text, sourceUrls } = await webSearch({
    apiKey: deps.openaiApiKey,
    model: deps.model,
    input: buildResearchPrompt(account),
  });
  const structured = await structuredCall<RawResearch>({
    apiKey: deps.openaiApiKey,
    model: deps.model,
    input: buildStructuringPrompt(text, sourceUrls),
    schema: RESEARCH_SCHEMA,
    schemaName: "research",
  });

  return {
    accountId: account.id ?? "",
    company: account.company,
    recentNews: structured.recent_news.map((n) => ({ date: n.date, item: n.item, sourceUrl: n.source_url })),
    operationalFootprint: structured.operational_footprint,
    techOrExpansionSignals: structured.tech_or_expansion_signals,
    hazardAnd247Context: structured.hazard_and_247_context,
    contractedCrewContext: structured.contracted_crew_context,
    bestHook: structured.best_hook,
    bestHookSource: structured.best_hook_source,
    sources: [...new Set([...sourceUrls, structured.best_hook_source, ...structured.recent_news.map((n) => n.source_url)])].filter(Boolean),
  };
}
