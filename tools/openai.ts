// Wraps the OpenAI Responses API exactly as the existing n8n GPT-4.1 nodes call
// it: web_search enabled for anything that must be grounded in real, live data
// (never rely on model memory for accounts/research/contacts), and a strict JSON
// schema for anything that must come back structured.
export interface OpenAiTextResult {
  text: string;
  sourceUrls: string[];
}

function extractOutputText(response: any): OpenAiTextResult {
  const parts =
    (response?.output ?? [])
      .filter((o: any) => o.type === "message")
      .flatMap((m: any) => m.content ?? [])
      .filter((c: any) => c.type === "output_text") ?? [];
  const text = parts.map((p: any) => p.text ?? "").join("");
  const sourceUrls = [
    ...new Set<string>(
      parts
        .flatMap((p: any) => p.annotations ?? [])
        .filter((a: any) => a.type === "url_citation" && a.url)
        .map((a: any) => a.url as string)
    ),
  ];
  return { text, sourceUrls };
}

/** A grounded web-search call. Use for account finding, account research, and
 * executive/contact search, anything that must reflect real, current, citable
 * information rather than the model's training data. */
export async function webSearch(opts: {
  apiKey: string;
  model?: string;
  input: string;
  temperature?: number;
}): Promise<OpenAiTextResult> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model ?? "gpt-4.1",
      input: opts.input,
      tools: [{ type: "web_search" }],
      temperature: opts.temperature ?? 0.2,
    }),
  });
  const json = await res.json();
  return extractOutputText(json);
}

/** A structured-output call (no web search), used to turn prose research into
 * strict JSON matching a schema, or to write/critique an email. */
export async function structuredCall<T = unknown>(opts: {
  apiKey: string;
  model?: string;
  system?: string;
  input: string;
  schema: Record<string, unknown>;
  schemaName: string;
  temperature?: number;
}): Promise<T> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model ?? "gpt-4.1",
      input: opts.system ? `${opts.system}\n\n${opts.input}` : opts.input,
      temperature: opts.temperature ?? 0.2,
      text: { format: { type: "json_schema", name: opts.schemaName, strict: true, schema: opts.schema } },
    }),
  });
  const json = await res.json();
  const { text } = extractOutputText(json);
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : text) as T;
}

/** A free-text generation call with no schema (used for the email writer/rewrite
 * steps, which return a formatted Subject/body block, not JSON). */
export async function freeTextCall(opts: {
  apiKey: string;
  model?: string;
  input: string;
  temperature?: number;
}): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model ?? "gpt-4.1",
      input: opts.input,
      temperature: opts.temperature ?? 0.7,
    }),
  });
  const json = await res.json();
  return extractOutputText(json).text.trim();
}
