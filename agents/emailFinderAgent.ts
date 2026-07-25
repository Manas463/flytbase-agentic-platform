// Thin agent wrapper around tools/emailFinder.ts. This is the ONLY place
// allowed to call resolveEmail, and only ever on a contact that already
// passed contactAgent's role-fit + source-verification gate. It never
// discovers a candidate to search for, it resolves one that already exists.
import type { Account, Contact } from "./types.js";
import { resolveEmail } from "../tools/emailFinder.js";

export interface EmailFinderDeps {
  prospeoKey: string;
  hunterKey: string;
  verify?: boolean;
}

export async function findEmailForContact(
  contact: Contact,
  account: Account,
  deps: EmailFinderDeps
): Promise<Contact> {
  const resolution = await resolveEmail(
    { name: contact.name, title: contact.title },
    { company: account.company, domain: account.domain },
    { prospeoKey: deps.prospeoKey, hunterKey: deps.hunterKey, verify: deps.verify }
  );

  return {
    ...contact,
    email: resolution.email,
    emailStatus: resolution.status,
    emailSource: resolution.source,
    emailConfidence: resolution.confidence,
    emailVerifiedStatus: resolution.emailVerifiedStatus,
    companyDomain: resolution.companyDomain || contact.companyDomain,
  };
}
