// Deterministic account qualification. The model gathers evidence; this file
// decides whether the evidence is sufficient to spend email-resolution and
// writing credits. A low-information account is sent through a bounded,
// targeted research loop instead of being guessed about or silently dropped.
import type {
  Account,
  Contact,
  EvidenceGap,
  ResearchBrief,
  StrategyScoreComponent,
  StrategyVerdict,
} from "./types.js";

export const STRATEGY_POLICY = {
  pursueThreshold: 70,
  maxResearchRetries: 1,
  weights: {
    icpFit: 30,
    evidenceQuality: 20,
    operationalPain: 20,
    flytbaseRelevance: 20,
    contactReadiness: 10,
  },
} as const;

export interface StrategyEvaluationOptions {
  attempt?: number;
  maxResearchRetries?: number;
}

const EMPTY_MARKERS = [
  "not found",
  "no findings",
  "no evidence",
  "not available",
  "could not verify",
  "unknown",
];

const FLYTBASE_MECHANISM_TERMS = [
  "inspection",
  "survey",
  "monitor",
  "tailings",
  "pit wall",
  "stockpile",
  "perimeter",
  "irrigation",
  "leach",
  "brine",
  "terrain",
  "hazard",
  "remote",
  "autonomous",
  "drone",
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function useful(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length >= 12 && !EMPTY_MARKERS.some((marker) => normalized.includes(marker));
}

function present(value: string): boolean {
  return value.trim().length > 1;
}

function validSource(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function criterion(
  criterionName: StrategyScoreComponent["criterion"],
  label: string,
  score: number,
  maxScore: number,
  reason: string
): StrategyScoreComponent {
  return { criterion: criterionName, label, score: round(clamp(score, 0, maxScore)), maxScore, reason };
}

/** Deterministic, code-computed check for a dispersed physical footprint - the
 * actual driver of aerial-inspection value (the anchor account is 678 km2 of
 * dispersed surface, which is why it worked, not its revenue). Looks for a
 * stated area unit, explicit dispersion language, or a named surface structure
 * whose whole failure mode is spread-out area. Returns 0-1. */
function footprintSignal(account: Account): { score: number; reason: string } {
  const hay = `${account.siteAreaEvidence} ${account.latamSites} ${account.opsEvidence}`.toLowerCase();

  const hasAreaFigure = /\d[\d,.]*\s*(km2|km²|sq\s?km|square kilomet|hectare|ha\b|acre)/.test(hay);
  const hasDispersion = /(dispersed|spread|multiple sites|several sites|separate sites|across \d+|network of)/.test(hay);
  const SURFACE_STRUCTURES = ["heap leach", "leach pad", "leach pile", "evaporation pond", "tailings", "open pit", "stockpile", "solar", "pipeline", "conveyor"];
  const structures = SURFACE_STRUCTURES.filter((s) => hay.includes(s));

  const score = clamp(
    (hasAreaFigure ? 0.5 : 0) + (hasDispersion ? 0.25 : 0) + Math.min(0.25, structures.length * 0.125),
    0,
    1
  );
  const parts = [
    hasAreaFigure ? "a stated site area" : "no stated site area",
    hasDispersion ? "explicit dispersion language" : "no dispersion language",
    structures.length ? `dispersed surface structures (${structures.join(", ")})` : "no named surface structures",
  ];
  return { score, reason: parts.join(", ") };
}

/** ICP fit is the heaviest criterion, and `account.icpScore` is produced by the
 * model rather than computed here - which is the one place this project's own
 * "enforce it in code after the model call" principle wasn't followed. Rather
 * than trust that number alone at full weight, the footprint half is now
 * computed deterministically in code from the evidence text, and the model's
 * similarity score carries the rest. A model that returns an inflated
 * icp_score for a compact, non-dispersed operation can no longer earn full
 * marks here on its own say-so. */
function scoreIcp(account: Account): StrategyScoreComponent {
  const modelPortion = STRATEGY_POLICY.weights.icpFit * 0.6;
  const footprintPortion = STRATEGY_POLICY.weights.icpFit * 0.4;

  const footprint = footprintSignal(account);
  const score =
    (clamp(account.icpScore, 0, 10) / 10) * modelPortion + footprint.score * footprintPortion;

  return criterion(
    "icp_fit",
    "ICP fit against SQM",
    score,
    STRATEGY_POLICY.weights.icpFit,
    `Model scored SQM similarity ${account.icpScore}/10 (${modelPortion} pts max). Code-computed dispersed-footprint signal ${footprint.score.toFixed(2)} (${footprintPortion} pts max): ${footprint.reason}.`
  );
}

function scoreEvidence(account: Account, research: ResearchBrief): StrategyScoreComponent {
  const accountSources = new Set(account.sources.filter(validSource));
  const researchSources = new Set(research.sources.filter(validSource));
  const sourcedDimensions = new Set(
    research.evidence.filter((item) => useful(item.claim) && validSource(item.sourceUrl)).map((item) => item.dimension)
  );
  const hookSourced = useful(research.bestHook) && validSource(research.bestHookSource);

  const score =
    Math.min(8, accountSources.size * 4) +
    Math.min(8, sourcedDimensions.size * 2) +
    (hookSourced ? 4 : 0);
  return criterion(
    "evidence_quality",
    "Evidence quality",
    score,
    STRATEGY_POLICY.weights.evidenceQuality,
    `${accountSources.size} account source(s), ${researchSources.size} research source(s), ${sourcedDimensions.size} sourced evidence dimension(s), ${hookSourced ? "sourced" : "unsourced"} hook.`
  );
}

function scoreOperationalPain(account: Account, research: ResearchBrief): StrategyScoreComponent {
  const hasHazard = useful(research.hazardAnd247Context);
  const hasCrews = useful(research.contractedCrewContext);
  const hasOps = useful(account.opsEvidence);
  const hasSourcedOps = research.evidence.some(
    (item) => ["operations", "hazard_247", "contracted_crews"].includes(item.dimension) && validSource(item.sourceUrl)
  );
  const score = (hasHazard ? 7 : 0) + (hasCrews ? 6 : 0) + (hasOps ? 4 : 0) + (hasSourcedOps ? 3 : 0);
  return criterion(
    "operational_pain",
    "Operational pain",
    score,
    STRATEGY_POLICY.weights.operationalPain,
    `Hazard/24-7 context ${hasHazard ? "found" : "missing"}; contracted-crew evidence ${hasCrews ? "found" : "missing"}; sourced operations evidence ${hasSourcedOps ? "found" : "missing"}.`
  );
}

function scoreFlytbaseRelevance(account: Account, research: ResearchBrief): StrategyScoreComponent {
  const hookSourced = useful(research.bestHook) && validSource(research.bestHookSource);
  const hasTechSignal = research.techOrExpansionSignals.some(useful);
  const haystack = [
    account.opsEvidence,
    research.operationalFootprint,
    research.hazardAnd247Context,
    research.contractedCrewContext,
    research.bestHook,
    ...research.techOrExpansionSignals,
  ]
    .join(" ")
    .toLowerCase();
  const matchedTerms = FLYTBASE_MECHANISM_TERMS.filter((term) => haystack.includes(term));
  const mechanismScore = Math.min(8, matchedTerms.length * 2);
  const score = (hookSourced ? 8 : 0) + (hasTechSignal ? 4 : 0) + mechanismScore;
  return criterion(
    "flytbase_relevance",
    "FlytBase relevance",
    score,
    STRATEGY_POLICY.weights.flytbaseRelevance,
    `${hookSourced ? "Sourced" : "No sourced"} personalization hook; ${hasTechSignal ? "technology/expansion signal found" : "technology/expansion signal missing"}; mechanism matches: ${matchedTerms.join(", ") || "none"}.`
  );
}

function scoreContactReadiness(contacts: Contact[], account: Account): StrategyScoreComponent {
  const sourced = contacts.filter((contact) => present(contact.name) && present(contact.title) && validSource(contact.evidenceSource));
  const roles = new Set(sourced.map((contact) => contact.roleMatch));
  const siteText = account.latamSites.toLowerCase();
  const siteWords = siteText.split(/[^a-záéíóúñü]+/i).filter((word) => word.length > 4);
  const hasSiteSpecific = sourced.some((contact) => {
    const text = `${contact.title} ${contact.notes}`.toLowerCase();
    return siteWords.some((word) => text.includes(word));
  });
  const score = Math.min(7, sourced.length * 5) + (roles.size >= 2 ? 2 : 0) + (hasSiteSpecific ? 1 : 0);
  return criterion(
    "contact_readiness",
    "Contact readiness",
    score,
    STRATEGY_POLICY.weights.contactReadiness,
    `${sourced.length} sourced role-fitting contact(s), ${roles.size} role family/families${hasSiteSpecific ? ", including a site-specific contact" : ""}.`
  );
}

function identifyGaps(criteria: StrategyScoreComponent[]): EvidenceGap[] {
  const byName = new Map(criteria.map((item) => [item.criterion, item]));
  const gaps: EvidenceGap[] = [];

  if ((byName.get("evidence_quality")?.score ?? 0) < 14) {
    gaps.push({
      id: "sourced_evidence",
      criterion: "evidence_quality",
      description: "The account lacks enough claim-level, source-backed evidence to qualify confidently.",
      researchQuestion: "Find primary or reputable sources that verify this account's scale, named LATAM operations, and current operating context.",
      owner: "research_agent",
      priority: "high",
    });
  }
  if ((byName.get("operational_pain")?.score ?? 0) < 12) {
    gaps.push({
      id: "operational_pain",
      criterion: "operational_pain",
      description: "Hazardous or continuous operating pain is not sufficiently evidenced.",
      researchQuestion: "Find sourced evidence of hazardous or 24/7 work, inspection/survey exposure, safety incidents, or reliance on contracted field crews at the named sites.",
      owner: "research_agent",
      priority: "high",
    });
  }
  if ((byName.get("flytbase_relevance")?.score ?? 0) < 12) {
    gaps.push({
      id: "flytbase_relevance",
      criterion: "flytbase_relevance",
      description: "No strong sourced mechanism connects the account's current priorities to autonomous drone inspection.",
      researchQuestion: "Find a recent, sourced inspection, surveying, monitoring, tailings, pit-wall, stockpile, perimeter, irrigation, terrain, safety, automation, or remote-operations signal that FlytBase can credibly address.",
      owner: "research_agent",
      priority: "high",
    });
  }
  if ((byName.get("contact_readiness")?.score ?? 0) < 5) {
    gaps.push({
      id: "contact_readiness",
      criterion: "contact_readiness",
      description: "No sourced, role-fitting decision maker has been verified.",
      researchQuestion: "Find a current Operations, HSE, Site, or Digital Transformation leader whose name and role are supported by a public source, prioritizing the named LATAM site.",
      owner: "contact_agent",
      priority: "medium",
    });
  }
  return gaps;
}

function hardReject(account: Account, attempt: number, maxAttempts: number, reason: string): StrategyVerdict {
  return {
    accountId: account.id ?? account.company,
    status: "reject",
    pursue: false,
    score: 0,
    pursueThreshold: STRATEGY_POLICY.pursueThreshold,
    reason,
    confidence: 1,
    criteria: [],
    gaps: [],
    attempt,
    maxAttempts,
    terminal: true,
  };
}

export function evaluateAccount(
  account: Account,
  research: ResearchBrief,
  contacts: Contact[],
  options: StrategyEvaluationOptions = {}
): StrategyVerdict {
  const attempt = options.attempt ?? 0;
  const maxResearchRetries = options.maxResearchRetries ?? STRATEGY_POLICY.maxResearchRetries;
  const maxAttempts = maxResearchRetries + 1;

  if (!account.sources.some(validSource)) {
    return hardReject(account, attempt, maxAttempts, "Rejected: no valid source supports the account itself.");
  }
  if (!account.geoOk) {
    return hardReject(account, attempt, maxAttempts, "Rejected: Latin American operations were not confirmed.");
  }

  const criteria = [
    scoreIcp(account),
    scoreEvidence(account, research),
    scoreOperationalPain(account, research),
    scoreFlytbaseRelevance(account, research),
    scoreContactReadiness(contacts, account),
  ];
  const score = round(criteria.reduce((total, item) => total + item.score, 0));
  const gaps = identifyGaps(criteria);
  const retryable = gaps.length > 0 && attempt < maxResearchRetries;
  const evidenceRatio = criteria
    .filter((item) => item.criterion !== "icp_fit")
    .reduce((total, item) => total + item.score / item.maxScore, 0) / 4;
  const confidence = round(clamp(0.45 + evidenceRatio * 0.5, 0, 0.95));

  if (score >= STRATEGY_POLICY.pursueThreshold && !gaps.some((gap) => gap.priority === "high")) {
    return {
      accountId: account.id ?? account.company,
      status: "pursue",
      pursue: true,
      score,
      pursueThreshold: STRATEGY_POLICY.pursueThreshold,
      reason: `Pursue: score ${score}/${STRATEGY_POLICY.pursueThreshold} with no critical evidence gap.`,
      confidence,
      criteria,
      gaps,
      attempt,
      maxAttempts,
      terminal: true,
    };
  }

  if (retryable) {
    return {
      accountId: account.id ?? account.company,
      status: "needs_more_research",
      pursue: false,
      score,
      pursueThreshold: STRATEGY_POLICY.pursueThreshold,
      reason: `Needs more research: score ${score}/${STRATEGY_POLICY.pursueThreshold}; unresolved gaps: ${gaps.map((gap) => gap.id).join(", ")}.`,
      confidence,
      criteria,
      gaps,
      attempt,
      maxAttempts,
      terminal: false,
    };
  }

  return {
    accountId: account.id ?? account.company,
    status: "reject",
    pursue: false,
    score,
    pursueThreshold: STRATEGY_POLICY.pursueThreshold,
    reason: `Reject: score ${score}/${STRATEGY_POLICY.pursueThreshold}${gaps.length ? ` after the research limit; unresolved gaps: ${gaps.map((gap) => gap.id).join(", ")}` : "; no researchable gap can close the qualification shortfall"}.`,
    confidence,
    criteria,
    gaps,
    attempt,
    maxAttempts,
    terminal: true,
  };
}
