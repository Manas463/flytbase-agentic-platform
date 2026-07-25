// Run with `npm run analyze`. Reads the last 10 completed runs and prints/
// saves a pattern report - what's actually failing critic review, why
// accounts get gated out, why contacts go unemailed. Read the output, then
// decide yourself what to change in skills/emailWriting.ts, skills/critic.ts,
// or agents/strategyAgent.ts's ICP_FLOOR. This script never touches those
// files itself.
import { analyzeRecentRuns } from "./runAnalytics.js";
import { writeFileSync, mkdirSync } from "node:fs";

async function main() {
  const report = await analyzeRecentRuns(10);

  mkdirSync("artifacts", { recursive: true });
  writeFileSync("artifacts/analytics-report.json", JSON.stringify(report, null, 2));

  console.log(`Analyzed ${report.runsAnalyzed} runs, ${report.emailsAnalyzed} emails.`);
  console.log(`First-try pass rate: ${(report.firstTryPassRate * 100).toFixed(0)}%  |  rewrite rate: ${(report.rewriteRate * 100).toFixed(0)}%`);

  console.log("\nFailure categories:");
  for (const [category, count] of Object.entries(report.failureCategoryCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}x  ${category}`);
  }

  console.log("\nTop raw failure strings:");
  for (const f of report.failureFrequency.slice(0, 10)) console.log(`  ${f.count}x  ${f.value}`);

  console.log("\nStrategy-gate rejections:");
  for (const r of report.strategyRejectReasons.slice(0, 10)) console.log(`  ${r.count}x  ${r.value}`);

  console.log("\nContact-not-found reasons:");
  for (const r of report.notFoundReasons.slice(0, 10)) console.log(`  ${r.count}x  ${r.value}`);

  console.log("\nFull report written to artifacts/analytics-report.json");
}

main().catch((err) => {
  console.error("Analytics run failed:", err);
  process.exit(1);
});
