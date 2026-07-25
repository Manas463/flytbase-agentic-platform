// The one real backend endpoint: POST /run-campaign. Mirrors the exact
// contract the frontend already calls against the old n8n webhook - accepts
// {target_vertical}, responds immediately with {id: runId} - so switching
// the frontend's fetch URL from the n8n webhook to this server is the only
// change needed on that side.
//
// The campaign itself runs in the background AFTER responding. A real run
// takes 1-2 minutes and makes many external API calls (OpenAI, Tavily,
// Prospeo, Hunter); that's exactly why this is a plain always-on Node
// process rather than a Cloudflare Worker, which has execution-time limits
// unsuited to a job this long-running.
//
// No framework: this is one endpoint plus a health check, Node's built-in
// http module is all that's needed.
import { createServer, type IncomingMessage } from "node:http";
import { createRun } from "../tools/supabase.js";
import { runCampaign } from "../runtime/runCampaign.js";
import { buildDefaultBrief } from "../runtime/defaultBrief.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

const deps = {
  openaiApiKey: requireEnv("OPENAI_API_KEY"),
  tavilyApiKey: requireEnv("TAVILY_API_KEY"),
  prospeoKey: requireEnv("PROSPEO_API_KEY"),
  hunterKey: requireEnv("HUNTER_API_KEY"),
};
requireEnv("SUPABASE_URL");
requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// Restrict this to the real frontend origin once it's deployed, "*" is a
// reasonable default only while everything is still local/in flux.
const ALLOWED_ORIGIN = process.env.FRONTEND_ORIGIN ?? "*";

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.method === "POST" && req.url === "/run-campaign") {
    try {
      const body = (await readJsonBody(req)) as { target_vertical?: string };
      const brief = buildDefaultBrief({ vertical: body.target_vertical });
      const runId = await createRun();

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: runId }));

      // Fire-and-forget: runCampaign() already marks the run failed in
      // Supabase internally on error, this catch only exists so a rejected
      // promise here doesn't crash the process.
      runCampaign(runId, brief, deps).catch((err) => {
        console.error(`Campaign run ${runId} failed:`, err);
      });
    } catch (err) {
      console.error("Failed to start campaign run:", err);
      if (!res.headersSent) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    }
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
