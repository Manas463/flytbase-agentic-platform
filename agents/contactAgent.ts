// Ported from "Build Contacts Prompt" + "Tavily: LinkedIn Lookup" + "Parse
// Contacts" in the existing n8n pipeline. Two independent search channels
// (general web search for exec mentions, Tavily restricted to linkedin.com)
// feed one structuring call, then role-fit + diversity selection happens in
// code (skills/roleFit.ts), never left to the model's own judgment.
import type { Account, CampaignBrief, Contact } from "./types.js";
import { webSearch, structuredCall } from "../tools/openai.js";
import { tavilySearch } from "../tools/tavily.js";
import { buildContactsPrompt, selectContacts, CONTACT_SCHEMA } from "../skills/roleFit.js";

export interface ContactAgentDeps {
  openaiApiKey: string;
  tavilyApiKey: string;
  model?: string;
}

interface RawContact {
  name: string;
  title: string;
  seniority: string;
  role_match: Contact["roleMatch"];
  linkedin_url: string;
  evidence_source: string;
  notes: string;
}

export async function findContacts(
  account: Account,
  brief: CampaignBrief,
  deps: ContactAgentDeps
): Promise<Contact[]> {
  const execSearch = await webSearch({
    apiKey: deps.openaiApiKey,
    model: deps.model,
    input: `Find named executives and site leaders at ${account.company} (${account.domain || "domain unknown"}) matching these role families: ${brief.targetTitles.join("; ")}. Report each with their full title and a real source URL. Latin American sites of interest: ${account.latamSites || "unspecified"}.`,
  });

  const linkedinResults = await tavilySearch({
    apiKey: deps.tavilyApiKey,
    query: `${account.company} ${brief.targetTitles.join(" OR ")} site:linkedin.com/in`,
    includeDomains: ["linkedin.com"],
    maxResults: 10,
  });

  const structured = await structuredCall<{ contacts: RawContact[] }>({
    apiKey: deps.openaiApiKey,
    model: deps.model,
    input: buildContactsPrompt({
      company: account.company,
      execSearchText: execSearch.text,
      linkedinResults,
      contactsPerAccount: brief.contactsPerAccount,
    }),
    schema: CONTACT_SCHEMA,
    schemaName: "contacts",
  });

  const rawContacts: Contact[] = structured.contacts
    .filter((c) => c.name && c.evidence_source)
    .map((c) => ({
      accountId: account.id ?? "",
      name: c.name,
      title: c.title,
      seniority: c.seniority,
      roleMatch: c.role_match,
      linkedinUrl: c.linkedin_url,
      linkedinValid: false, // set by selectContacts
      evidenceSource: c.evidence_source,
      notes: c.notes,
      email: "",
      emailStatus: "",
      emailSource: "",
      emailConfidence: null,
      emailVerifiedStatus: "",
      companyDomain: account.domain,
    }));

  return selectContacts(rawContacts, brief.contactsPerAccount, account.latamSites);
}
