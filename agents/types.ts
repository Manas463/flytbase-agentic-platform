// Shared type contracts. Every agent, skill, and the Shared Memory layer speaks
// these shapes. This mirrors the existing Supabase schema (runs/accounts/contacts/
// emails/research) directly, on purpose, so the new runtime can read/write the
// same tables the existing frontend already displays without a migration.

export type RoleFamily = "operations" | "hse" | "site" | "digital_transformation" | "other";

export interface CampaignBrief {
  vertical: string;
  anchor: string; // hardcoded to SQM upstream; never let this drift per-run
  goal: string;
  angle: string;
  maxAccounts: number;
  contactsPerAccount: number;
  targetTitles: string[]; // the four role families, human-readable variants incl. Spanish/Portuguese
  proofCustomers: string[]; // Shell, Anglo American, CSX (existing customers cited as proof)
  suppression: string[]; // existing customers to exclude from prospecting entirely
  senderName: string;
  senderTitle: string;
}

export interface Account {
  id?: string;
  runId: string;
  company: string;
  domain: string;
  hqCountry: string;
  latamSites: string;
  commodity: string;
  scaleEvidence: string;
  opsEvidence: string;
  whyFitVsAnchor: string;
  icpScore: number; // scale 40% / hazard+24-7 ops 30% / geography 20% / tech-adoption 10%, all vs. SQM
  ownershipFlags: string;
  sources: string[]; // every account MUST carry real source URLs, never fabricate
  geoOk: boolean; // confirmed by OPERATIONS, not HQ
}

export interface ResearchBrief {
  accountId: string;
  company: string;
  recentNews: { date: string; item: string; sourceUrl: string }[];
  operationalFootprint: string;
  techOrExpansionSignals: string[];
  hazardAnd247Context: string;
  contractedCrewContext: string;
  bestHook: string;
  bestHookSource: string;
  sources: string[];
}

export interface Contact {
  id?: string;
  accountId: string;
  name: string;
  title: string;
  seniority: string;
  roleMatch: RoleFamily;
  linkedinUrl: string;
  linkedinValid: boolean;
  evidenceSource: string; // required: a source backing BOTH name and role, or the contact is dropped
  notes: string;
  email: string;
  emailStatus: string;
  emailSource: "hunter_domain_search" | "prospeo" | "hunter_email_finder" | "not_found" | "";
  emailConfidence: number | null;
  emailVerifiedStatus: string; // "valid" | "accept_all" | "invalid" | "unknown" | ""
  companyDomain: string;
}

export interface EmailDraft {
  contactId: string;
  subject: string;
  body: string;
  signalUsed: string;
  proofUsed: string; // which PROOF_LIBRARY entry was cited, for auditability
  criticVerdict: { passed: boolean; failures: string[] } | null;
  rewrittenAfterCritic: boolean;
  status: "ready" | "sent";
}

export interface StrategyVerdict {
  accountId: string;
  pursue: boolean;
  reason: string;
  confidence: number;
}

export interface ReflectionEntry {
  stage: string;
  confidence: number;
  failures: string[];
  suggestions: string[];
  retryRecommended: boolean;
}

export interface RunSummary {
  id: string;
  status: "running" | "done" | "failed";
  accountsFound: number;
  emailsGenerated: number;
  contactsNotFound: number;
  contactsNotFoundDetail: { company: string; reason: string }[];
  error: string | null;
}
