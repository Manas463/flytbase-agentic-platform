// Locks in the three fixes identified in the 2026-08-01 research pack
// (doc 10, parts 4-5). Each test asserts the specific behavioural claim the
// audit made, not implementation detail, so these fail loudly if someone
// reverts a fix or re-tunes it into uselessness.
import test from "node:test";
import assert from "node:assert/strict";
import { pickProof, PROOF_LIBRARY } from "../skills/proofLibrary.js";
import { deriveSegments } from "../agents/accountAgent.js";
import { ICP_WEIGHTS } from "../skills/icpScoring.js";
import { evaluateAccount } from "../agents/strategyAgent.js";
import type { Account, Contact, ResearchBrief } from "../agents/types.js";

// ---------------------------------------------------------------------------
// FIX 1 — the SQM proof point describes the real deployment
// ---------------------------------------------------------------------------

test("fix 1: a heap-leach prospect matches the SQM proof point", () => {
  // The audit's exact example: "a copper heap-leach prospect whose research
  // mentions 'leach pad irrigation' currently matches this proof point on
  // nothing." It must now match SQM.
  const proof = pickProof(
    "The operation runs copper oxide heap leach pads with sprinkler irrigation across the pad surface."
  );
  assert.equal(proof.name, "SQM");
});

test("fix 1: the SQM line states the real mechanism, not the old wrong one", () => {
  const line = PROOF_LIBRARY.sqm.line.toLowerCase();
  // Real mechanism: caliche heap-leach irrigation + thermal monitoring for iodine.
  assert.match(line, /leach/);
  assert.match(line, /irrigation|sprinkler/);
  assert.match(line, /thermal/);
  assert.match(line, /iodine/);
  // The prior line claimed a lithium deployment and perimeter/tailings
  // monitoring. None of that happened - lithium is a physically separate
  // business (brine in the Salar de Atacama) and the perimeter docks were
  // only ordered, never deployed.
  assert.doesNotMatch(line, /lithium/);
  assert.doesNotMatch(line, /perimeter/);
  assert.doesNotMatch(line, /tailings/);
});

test("fix 1: the SQM keywords cover the heap-leach vocabulary that was missing", () => {
  const keywords = PROOF_LIBRARY.sqm.keywords;
  for (const required of ["leach", "irrigation", "sprinkler", "heap", "caliche", "thermal"]) {
    assert.ok(keywords.includes(required), `SQM keywords must include "${required}"`);
  }
});

test("fix 1: lithium prospects still route to SQM - keywords are routing, not claims", () => {
  // The line must stay factual (no lithium deployment happened), but the
  // keywords decide who SEES this proof, and lithium brine operators are
  // genuinely close-shape SQM-like targets: dispersed evaporation ponds,
  // aerial-visible, yield dependent on even distribution over a huge area.
  // Excluding lithium from routing meant a lithium prospect matched nothing.
  assert.ok(PROOF_LIBRARY.sqm.keywords.includes("lithium"), "lithium must route to the SQM proof");
  assert.equal(
    pickProof("A lithium brine operation with evaporation ponds across the salar.").name,
    "SQM"
  );
});

test("fix 1: proof matching still discriminates - it did not become SQM-for-everything", () => {
  // Guards against the lazy way to pass the first test (stuffing SQM with
  // generic keywords). Distinct mechanisms must still route elsewhere.
  assert.equal(pickProof("Inspecting elevated flare stacks without scaffolding at the refinery.").name, "Shell");
  assert.equal(pickProof("Rail yard rolling stock defect detection across the yard.").name, "CSX");
  assert.equal(
    pickProof("Topographic survey of active open pit faces and unstable terrain at Quellaveco.").name,
    "Anglo American"
  );
});

// ---------------------------------------------------------------------------
// FIX 2 — search segments come from the brief, not a hardcoded list
// ---------------------------------------------------------------------------

test("fix 2: segments are derived from the vertical, not hardcoded", () => {
  const segments = deriveSegments("Large-scale lithium, copper, and iron ore mining operations in Latin America");
  assert.deepEqual(segments, ["lithium", "copper", "iron ore"]);
});

test("fix 2: changing the vertical actually changes what gets searched", () => {
  // This is the whole point of the fix. Before it, defaultBrief.ts advertised
  // `vertical` as overridable from the UI while accountAgent.ts ignored it and
  // always searched lithium/copper/iron ore.
  const segments = deriveSegments("gold and silver heap leach operations in Peru");
  assert.ok(segments.some((s) => s.includes("gold")), `expected a gold segment, got ${JSON.stringify(segments)}`);
  assert.ok(!segments.includes("lithium"), "must not fall back to the hardcoded default when the vertical is usable");
});

test("fix 2: stopwords are stripped so no segment is descriptive noise", () => {
  const segments = deriveSegments("large-scale copper mining operations in Latin America");
  assert.deepEqual(segments, ["copper"]);
});

test("fix 2: an empty or unusable vertical falls back to the tuned default", () => {
  // Falling back beats searching for nothing: the default trio is the
  // scenario the rest of the system (proof library, LATAM guards) is tuned for.
  assert.deepEqual(deriveSegments(""), ["lithium", "copper", "iron ore"]);
  assert.deepEqual(deriveSegments("   mining operations   "), ["lithium", "copper", "iron ore"]);
});

test("fix 2: segment count is capped so one run cannot fan out unbounded", () => {
  // Each segment costs a grounded web search plus a structuring call, so an
  // essay-length vertical must not turn into a dozen paid API calls.
  const segments = deriveSegments("lithium, copper, iron ore, gold, silver, nickel, cobalt, zinc, tin, uranium");
  assert.ok(segments.length <= 4, `expected at most 4 segments, got ${segments.length}`);
});

// ---------------------------------------------------------------------------
// FIX 3 — dispersed physical footprint is its own ICP signal
// ---------------------------------------------------------------------------

test("fix 3: inspectable area outweighs company scale in the ICP weights", () => {
  // The audit's core finding: the old weights made `scale` (revenue /
  // production / workforce) the heaviest factor at 0.4, but what made SQM a
  // good account was 678 km2 of dispersed site, not US$4.6bn of revenue.
  assert.ok(
    ICP_WEIGHTS.inspectableArea > ICP_WEIGHTS.companyScale,
    "dispersed footprint must outweigh company size"
  );
  assert.ok(
    ICP_WEIGHTS.inspectableArea >= Math.max(...Object.values(ICP_WEIGHTS)),
    "inspectable area must be the heaviest single ICP weight"
  );
  const total = Object.values(ICP_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `ICP weights must sum to 1, got ${total}`);
});

const baseResearch: ResearchBrief = {
  accountId: "a1",
  company: "Test Co",
  recentNews: [{ date: "2026-01-10", item: "Expanded monitoring", sourceUrl: "https://example.com/news" }],
  operationalFootprint: "Named operating site with remote terrain inspection.",
  techOrExpansionSignals: ["The company expanded automated site monitoring."],
  hazardAnd247Context: "Round-the-clock hazardous field operations are documented.",
  contractedCrewContext: "Contracted survey crews work on site.",
  bestHook: "The operator is expanding autonomous inspection.",
  bestHookSource: "https://example.com/hook",
  sources: ["https://example.com/news", "https://example.com/hook"],
  evidence: [
    { dimension: "operations", claim: "The mine operates continuously.", sourceUrl: "https://example.com/ops" },
    { dimension: "hazard_247", claim: "Crews work hazardous terrain.", sourceUrl: "https://example.com/safety" },
    { dimension: "contracted_crews", claim: "Contracted crews inspect.", sourceUrl: "https://example.com/crews" },
  ],
};

const baseContact: Contact = {
  accountId: "a1",
  name: "Ana Silva",
  title: "Site Director",
  seniority: "Director",
  roleMatch: "site",
  linkedinUrl: "https://linkedin.com/in/ana-silva",
  linkedinValid: true,
  evidenceSource: "https://example.com/leadership",
  notes: "Leads the site.",
  email: "",
  emailStatus: "",
  emailSource: "",
  emailConfidence: null,
  emailVerifiedStatus: "",
  companyDomain: "test.example",
};

function accountWith(overrides: Partial<Account>): Account {
  return {
    runId: "run-1",
    company: "Test Co",
    domain: "test.example",
    hqCountry: "Chile",
    latamSites: "Atacama Site, Chile",
    commodity: "Copper",
    siteAreaEvidence: "",
    scaleEvidence: "",
    opsEvidence: "Continuous operations with hazardous field work.",
    whyFitVsAnchor: "LATAM operation.",
    icpScore: 9,
    ownershipFlags: "",
    sources: ["https://example.com/account"],
    geoOk: true,
    ...overrides,
  };
}

test("fix 3: a sprawling mid-size operator outscores a compact giant", () => {
  // The audit's exact scenario, and the sharpest test of the whole fix:
  // "A big company with a compact underground mine is a bad target. A mid-size
  // operator with a sprawling leach pad is a great one." Both accounts carry
  // an IDENTICAL model-supplied icpScore, so any difference in the resulting
  // verdict comes from code-computed footprint, not the model's opinion.
  const compactGiant = accountWith({
    company: "Compact Giant",
    siteAreaEvidence: "",
    scaleEvidence: "US$12 billion annual revenue and 40,000 employees.",
    opsEvidence: "A single compact underground mine with a concentrated shaft complex.",
  });
  const sprawlingMidsize = accountWith({
    company: "Sprawling Midsize",
    siteAreaEvidence: "A 600 km2 concession with heap leach pads dispersed across multiple sites.",
    scaleEvidence: "US$400 million annual revenue.",
  });

  const compactVerdict = evaluateAccount(compactGiant, baseResearch, [baseContact]);
  const sprawlingVerdict = evaluateAccount(sprawlingMidsize, baseResearch, [baseContact]);

  assert.ok(
    sprawlingVerdict.score > compactVerdict.score,
    `sprawling (${sprawlingVerdict.score}) must outscore compact giant (${compactVerdict.score})`
  );
});

test("fix 3: the model's icp_score alone cannot earn full ICP marks", () => {
  // The known issue the audit flagged: icp_score is an LLM guess and was the
  // single heaviest criterion. An account claiming a perfect 10 while showing
  // no footprint evidence must not score full marks on ICP fit.
  const inflated = accountWith({ icpScore: 10, siteAreaEvidence: "", opsEvidence: "A compact plant." });
  const verdict = evaluateAccount(inflated, baseResearch, [baseContact]);
  const icp = verdict.criteria.find((c) => c.criterion === "icp_fit");
  assert.ok(icp, "expected an icp_fit criterion in the verdict");
  assert.ok(
    icp!.score < icp!.maxScore,
    `a model claim of 10/10 with no footprint evidence must not earn full ICP marks (got ${icp!.score}/${icp!.maxScore})`
  );
});

test("fix 3: footprint evidence is reported in the ICP reasoning, not silently used", () => {
  // Every criterion carries a human-readable reason; the footprint half must
  // show up there so a rejected or pursued account is explainable.
  const verdict = evaluateAccount(
    accountWith({ siteAreaEvidence: "A 600 km2 site with dispersed leach pads across multiple sites." }),
    baseResearch,
    [baseContact]
  );
  const icp = verdict.criteria.find((c) => c.criterion === "icp_fit");
  assert.match(icp!.reason, /area|footprint|dispers/i);
});
