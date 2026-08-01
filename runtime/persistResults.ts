// Shapes a finished campaign run into the exact payload the existing
// `import_run_results` Postgres RPC expects, then calls it once. The shape
// below is NOT guessed: it's a direct port of the real n8n "Build Run
// Payload" node's output (read from flytbase-bdr-agent.n8n.json), which is
// the same JSON body that node has already been sending this RPC in
// production. Two behaviors are deliberately preserved exactly as-is, not
// "improved":
//   1. Only contacts with a resolved email AND a generated draft are sent
//      (contacts with no resolved email never reached the RPC in the n8n
//      version either, they only show up in summary.contacts_not_found_detail).
//   2. critic_verdict is labeled "passed" or "passed_after_rewrite" the same
//      way the n8n code did, it does not re-check whether a post-rewrite
//      draft actually passed, matching existing production behavior.
import type { Account, Contact, ResearchBrief, RunSummary } from "../agents/types.js";
import {
  importRunResults,
  getContactIdByEmail,
  insertFollowUpEmail,
  updateAccountSiteArea,
} from "../tools/supabase.js";

function toImportResearch(research: ResearchBrief | undefined) {
  if (!research) return null;
  return {
    company: research.company,
    recent_news: research.recentNews.map((n) => ({ date: n.date, item: n.item, source_url: n.sourceUrl })),
    operational_footprint: research.operationalFootprint,
    tech_or_expansion_signals: research.techOrExpansionSignals,
    hazard_and_247_context: research.hazardAnd247Context,
    contracted_crew_context: research.contractedCrewContext,
    best_hook: research.bestHook,
    best_hook_source: research.bestHookSource,
    sources: research.sources,
  };
}

function toImportContact(contact: Contact) {
  const deliverable = contact.emailVerifiedStatus === "deliverable" || contact.emailVerifiedStatus === "valid";
  return {
    name: contact.name,
    title: contact.title,
    seniority: contact.seniority,
    role_match: contact.roleMatch,
    linkedin_url: contact.linkedinUrl,
    evidence_source: contact.evidenceSource,
    notes: contact.notes,
    email: contact.email,
    email_status: contact.emailStatus,
    email_source: contact.emailSource,
    email_confidence: contact.emailConfidence == null ? "" : String(contact.emailConfidence),
    email_verified_status: contact.emailVerifiedStatus,
    email_deliverable: deliverable,
    company_domain: contact.companyDomain || "",
    email_draft: {
      subject: contact.draft!.subject,
      body: contact.draft!.body,
      status: "ready",
      signal_used: contact.draft!.signalUsed,
      critic_verdict: contact.draft!.criticVerdict?.passed ? "passed" : "passed_after_rewrite",
      rewritten_after_critic: contact.draft!.rewrittenAfterCritic,
    },
  };
}

export interface PersistResultsInput {
  accounts: Account[];
  contactsByAccount: Record<string, Contact[]>;
  researchByAccount: Record<string, ResearchBrief>;
  summary: RunSummary;
}

export function buildImportPayload(input: PersistResultsInput) {
  const accounts = input.accounts.map((account) => ({
    company: account.company,
    domain: account.domain,
    hq_country: account.hqCountry,
    latam_sites: account.latamSites,
    commodity: account.commodity,
    scale_evidence: account.scaleEvidence,
    ops_evidence: account.opsEvidence,
    why_fit_vs_anchor: account.whyFitVsAnchor,
    icp_score: account.icpScore,
    ownership_flags: account.ownershipFlags,
    sources: account.sources,
    research: toImportResearch(input.researchByAccount[account.company]),
    contacts: (input.contactsByAccount[account.company] ?? [])
      .filter((c) => c.draft) // matches the n8n contract: undrafted contacts never reach this RPC
      .map(toImportContact),
  }));

  return {
    accounts,
    summary: {
      accounts_found: input.summary.accountsFound,
      emails_generated: input.summary.emailsGenerated,
      contacts_not_found: input.summary.contactsNotFound,
      contacts_not_found_detail: input.summary.contactsNotFoundDetail,
    },
  };
}

export async function persistResults(runId: string, input: PersistResultsInput): Promise<void> {
  const payload = buildImportPayload(input);
  await importRunResults(runId, payload);
  await persistSiteAreaEvidence(runId, input);
  await persistFollowUps(runId, input);
}

/** Without this the dispersed-footprint evidence is computed, used to score the
 * account, and then thrown away - it would never reach the dashboard, so a
 * human reviewing why an account qualified couldn't see the single heaviest
 * piece of evidence behind that decision. */
async function persistSiteAreaEvidence(runId: string, input: PersistResultsInput): Promise<void> {
  for (const account of input.accounts) {
    if (!account.siteAreaEvidence) continue; // nothing found is normal, don't write an empty string over it
    await updateAccountSiteArea(runId, account.company, account.siteAreaEvidence);
  }
}

/** The RPC only ever writes the cold email (sequence_index 0). Follow-ups
 * are inserted directly afterward, once the RPC has actually created the
 * contact row we need to attach them to. Looked up by email rather than
 * carrying an ID through, since import_run_results returns void. */
async function persistFollowUps(runId: string, input: PersistResultsInput): Promise<void> {
  const contactsWithFollowUps = Object.values(input.contactsByAccount)
    .flat()
    .filter((c) => c.email && c.followUps?.length);

  for (const contact of contactsWithFollowUps) {
    const contactId = await getContactIdByEmail(runId, contact.email);
    if (!contactId) continue; // shouldn't happen - the RPC just inserted this contact - but never guess an ID
    for (const followUp of contact.followUps ?? []) {
      await insertFollowUpEmail({
        runId,
        contactId,
        subject: followUp.subject,
        body: followUp.body,
        signalUsed: followUp.signalUsed,
        criticVerdict: followUp.criticVerdict?.passed ? "passed" : "passed_after_rewrite",
        rewrittenAfterCritic: followUp.rewrittenAfterCritic,
        sequenceIndex: followUp.sequenceIndex,
      });
    }
  }
}
