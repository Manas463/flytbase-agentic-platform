// Real entry point: builds the actual campaign brief (lithium/copper/iron-ore
// mining in Latin America, SQM as the hardcoded anchor, four role families,
// the four real proof customers) and runs it end to end. Run with:
//   node --env-file=.env --experimental-strip-types runtime/cli.ts
// or, with the "campaign" npm script, which uses tsx instead so you don't
// need Node's experimental TS flag.
import { runCampaign } from "./runCampaign.js";
import { buildDefaultBrief } from "./defaultBrief.js";
import { createRun } from "../tools/supabase.js";
import { writeFileSync, mkdirSync } from "node:fs";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

const BRIEF = buildDefaultBrief();

async function main() {
  const deps = {
    openaiApiKey: requireEnv("OPENAI_API_KEY"),
    tavilyApiKey: requireEnv("TAVILY_API_KEY"),
    prospeoKey: requireEnv("PROSPEO_API_KEY"),
    hunterKey: requireEnv("HUNTER_API_KEY"),
  };
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const runId = await createRun();
  console.log(`Starting campaign run ${runId}...`);
  const result = await runCampaign(runId, BRIEF, deps);

  mkdirSync("artifacts", { recursive: true });
  const outPath = `artifacts/run-${result.summary.id}.json`;
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log(`Done. Accounts: ${result.summary.accountsFound}, emails: ${result.summary.emailsGenerated}, not-found: ${result.summary.contactsNotFound}`);
  console.log(`Full output written to ${outPath}`);
  if (result.summary.contactsNotFoundDetail.length) {
    console.log("Not-found detail:", result.summary.contactsNotFoundDetail);
  }
}

main().catch((err) => {
  console.error("Campaign run failed:", err);
  process.exit(1);
});
