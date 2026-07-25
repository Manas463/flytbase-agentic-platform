// Ported from the existing "Tavily: LinkedIn Lookup" node. Used specifically for
// LinkedIn-restricted contact evidence, a second, independent search channel
// alongside the general web-search executive search, so contacts have two real
// sources to be checked against, not one.
export interface TavilyResult {
  title: string;
  url: string;
  snippet: string;
}

export async function tavilySearch(opts: {
  apiKey: string;
  query: string;
  includeDomains?: string[];
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
}): Promise<TavilyResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: opts.apiKey,
      query: opts.query,
      search_depth: opts.searchDepth ?? "advanced",
      include_domains: opts.includeDomains,
      max_results: opts.maxResults ?? 8,
      include_answer: false,
    }),
  });
  const json = await res.json();
  return (json?.results ?? []).map((r: any) => ({
    title: r.title,
    url: r.url,
    snippet: String(r.content ?? "").slice(0, 500),
  }));
}
