import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAccount, STRATEGY_POLICY } from "../agents/strategyAgent.js";
import { reflectOnStrategy } from "../agents/reflectionAgent.js";
import type { Account, Contact, ResearchBrief } from "../agents/types.js";

const account: Account = {
  runId: "run-1",
  company: "Real Mining Co",
  domain: "real.example",
  hqCountry: "Chile",
  latamSites: "Atacama Site, Chile",
  commodity: "Copper",
  siteAreaEvidence: "A 450 km2 concession with dispersed heap leach pads across multiple sites.",
  scaleEvidence: "Large-scale annual production supported by a filing.",
  opsEvidence: "Continuous open-pit operations with hazardous field work.",
  whyFitVsAnchor: "Large hazardous LATAM operation.",
  icpScore: 9,
  ownershipFlags: "",
  sources: ["https://example.com/account", "https://example.com/filing"],
  geoOk: true,
};

const strongResearch: ResearchBrief = {
  accountId: "account-1",
  company: account.company,
  recentNews: [{ date: "2026-01-10", item: "Expanded remote monitoring", sourceUrl: "https://example.com/news" }],
  operationalFootprint: "A named high-altitude open pit with remote terrain inspection.",
  techOrExpansionSignals: ["The company expanded automated site monitoring."],
  hazardAnd247Context: "The official report describes round-the-clock hazardous field operations.",
  contractedCrewContext: "The filing identifies contracted survey crews working on site.",
  bestHook: "The operator is expanding autonomous inspection at its Atacama site.",
  bestHookSource: "https://example.com/hook",
  sources: ["https://example.com/news", "https://example.com/hook", "https://example.com/safety"],
  evidence: [
    { dimension: "operations", claim: "The mine operates continuously.", sourceUrl: "https://example.com/ops" },
    { dimension: "hazard_247", claim: "Field crews work around hazardous terrain.", sourceUrl: "https://example.com/safety" },
    { dimension: "contracted_crews", claim: "Contracted survey crews support inspections.", sourceUrl: "https://example.com/crews" },
    { dimension: "technology", claim: "Remote monitoring is expanding.", sourceUrl: "https://example.com/news" },
  ],
};

const contact: Contact = {
  accountId: "account-1",
  name: "Ana Silva",
  title: "Site Director",
  seniority: "Director",
  roleMatch: "site",
  linkedinUrl: "https://linkedin.com/in/ana-silva",
  linkedinValid: true,
  evidenceSource: "https://example.com/leadership",
  notes: "Leads the Atacama Site.",
  email: "",
  emailStatus: "",
  emailSource: "",
  emailConfidence: null,
  emailVerifiedStatus: "",
  companyDomain: "real.example",
};

test("pursues a strongly sourced and relevant account", () => {
  const verdict = evaluateAccount(account, strongResearch, [contact]);
  assert.equal(verdict.status, "pursue");
  assert.equal(verdict.pursue, true);
  assert.ok(verdict.score >= STRATEGY_POLICY.pursueThreshold);
  assert.equal(verdict.terminal, true);
});

test("identifies exact gaps and recommends a bounded retry", () => {
  const weakResearch: ResearchBrief = {
    ...strongResearch,
    recentNews: [],
    operationalFootprint: "",
    techOrExpansionSignals: [],
    hazardAnd247Context: "",
    contractedCrewContext: "",
    bestHook: "",
    bestHookSource: "",
    sources: [],
    evidence: [],
  };
  const verdict = evaluateAccount(account, weakResearch, []);
  assert.equal(verdict.status, "needs_more_research");
  assert.deepEqual(
    verdict.gaps.map((gap) => gap.id),
    ["sourced_evidence", "operational_pain", "flytbase_relevance", "contact_readiness"]
  );
  assert.equal(verdict.terminal, false);

  const reflection = reflectOnStrategy(verdict);
  assert.equal(reflection.retryRecommended, true);
  assert.deepEqual(reflection.gapIds, verdict.gaps.map((gap) => gap.id));
  assert.ok(reflection.suggestions.every((suggestion) => suggestion.includes("agent:")));
});

test("rejects honestly when the retry limit is exhausted", () => {
  const weakResearch: ResearchBrief = {
    ...strongResearch,
    operationalFootprint: "",
    techOrExpansionSignals: [],
    hazardAnd247Context: "",
    contractedCrewContext: "",
    bestHook: "",
    bestHookSource: "",
    sources: [],
    evidence: [],
  };
  const verdict = evaluateAccount(account, weakResearch, [], { attempt: 1 });
  assert.equal(verdict.status, "reject");
  assert.equal(verdict.terminal, true);
  assert.match(verdict.reason, /research limit/i);
});

test("hard-rejects an account with no valid source", () => {
  const verdict = evaluateAccount({ ...account, sources: ["invented"] }, strongResearch, [contact]);
  assert.equal(verdict.status, "reject");
  assert.equal(verdict.confidence, 1);
  assert.match(verdict.reason, /no valid source/i);
});
