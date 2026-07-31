# HANDOFF — read this first, in a fresh session, before touching anything

This supersedes the previous version of this file, which was written before the agentic platform existed and is now badly stale. Everything below reflects what's actually built, deployed, tested, and true right now. If you're picking this up in a new chat: read this whole file first.

---

## 1. What this project actually is, right now

Started as a FlytBase Business Development Representative (Outbound) take-home / hackathon assignment: build a working AI agent that takes a campaign brief (target vertical + reference account) and automatically produces target accounts, contacts, company research, and personalized outbound emails — real data only, zero fabrication, or it's disqualified.

It now exists as **one consolidated, deployed system**, not a plan:

1. **The original n8n workflow** (`flytbase-bdr-agent.n8n.json`, at `~/pipeline-review/`) — the first working version, hardened through many iterations. Historical reference now; the TypeScript platform below is the actively developed system.
2. **The TypeScript agentic platform** — this repo, `~/Desktop/flytbase-agentic-platform/`. Fully built: real agents, real skills, real tools, a real dynamic task-graph orchestrator, a real Strategy Agent with a gap-driven retry loop, a real cross-run feedback/analytics tool, a real 4-touch email sequence (cold email + 3 follow-ups), a real frontend, and a real backend — **both deployed live on Render**, not just running locally.
3. **A hackathon submission** built from this — Submission.md, a mind map, the GitHub repo, and two live Render URLs. See section 6.

**The one constraint that shaped every decision:** every account/contact/research claim must carry a real source or be explicitly marked not-found. Never trust a hard rule to a prompt alone if it can be enforced in code — this got learned the hard way, twice (see section 7).

---

## 2. Where everything lives

| What | Where |
|---|---|
| **This repo** | `~/Desktop/flytbase-agentic-platform/` — GitHub: `https://github.com/Manas463/flytbase-agentic-platform`, branch `main`. SSH auth already works, plain `git push` needs no tokens. |
| **Live frontend (the actual submission link)** | `https://flytbase-agentic-platform-1.onrender.com` — Render Web Service, root dir `frontend/`, build `npm install && npm run build`, start `node .output/server/index.mjs`. |
| **Live backend** | `https://flytbase-agentic-platform.onrender.com` — Render Web Service, root dir blank (repo root), build `npm install`, start `npm run start`. One endpoint: `POST /run-campaign`. Health check: `GET /health`. |
| **Database** | Supabase project `zvlchtfozsbjffxkirme`. Tables: `runs`, `accounts`, `contacts`, `research`, `emails` (now has a `sequence_index` column, 0=cold email, 1/2/3=follow-ups), plus a new `run_memory` key-value table (Shared Memory, see section 4). |
| **The old, separate frontend repo** | `~/pipeline-review/` — superseded. Its frontend code was copied (fresh, no git history) into this repo's `frontend/`. Its Cloudflare deployment still exists but is no longer the canonical one; Render is. |
| **Local env vars** | `.env` at repo root (backend/runtime secrets: `OPENAI_API_KEY`, `TAVILY_API_KEY`, `PROSPEO_API_KEY`, `HUNTER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and `frontend/.env` (Supabase public keys + `VITE_RUN_CAMPAIGN_URL` pointing at the backend). Both gitignored, never committed. |
| **Render env vars** | Same secrets, set directly in each service's dashboard (Environment tab). The backend service also has `FRONTEND_ORIGIN` set to the frontend's URL, for CORS. |
| **Hackathon deliverables** | `docs/Submission.md`, `docs/mindmap.html` (both in this repo, committed). GitHub link and the two Render URLs above are the other two. Fifth (walkthrough video) is manual, not yet recorded as of this writing. |
| **Personal-reference-only files, deliberately never pushed** | `docs/FlytBase_5-Minute_Walkthrough.html`, any `*.pdf` — both gitignored on purpose. |

**Reviewer access gap, still open:** the live frontend is gated behind plain Supabase email/password login with **no self-serve signup**. A reviewer landing on the live link cannot get in without a real account. Not yet resolved — options are: create a dedicated reviewer account in Supabase Auth, share your own login, or remove the auth gate. Ask before doing any of these, they're real account/access changes.

---

## 3. The pipeline architecture, as it actually runs

Entry point: `backend/server.ts` (`POST /run-campaign`) or `runtime/cli.ts` (manual `npm run campaign`). Both call `runtime/runCampaign.ts`.

**Three separate places data lives — this distinction matters, it's the thing people get confused by:**
1. **In-process memory** — plain JS objects/Maps inside the one running `runCampaign()` call (`accountByKey`, `contactsByAccount`, `researchByAccount`). Gone the instant the run finishes. This is what actually moves the pipeline forward, agents call each other and pass this data directly.
2. **Shared Memory** (`run_memory` Supabase table, via `runtime/sharedMemory.ts`) — a permanent diagnostic log. Every agent *also* writes its output here, keyed by `run_id`. Nothing reads this to keep the pipeline moving; it's read later by a human or by `npm run analyze`.
3. **Production tables** (`accounts`/`contacts`/`research`/`emails`) — the final, clean output, written *once* at the very end via `runtime/persistResults.ts`. This is the only thing the live frontend ever reads.

**The engine:** `agents/plannerAgent.ts` builds a task graph that starts with exactly one task (`find_accounts`) and *grows at runtime* — `runtime/taskGraphExecutor.ts` runs whatever task's dependencies are satisfied, and any task can call `ctx.addTasks()` to add more mid-flight (this is how account count / contact count, unknown up front, get handled). `runtime/scheduler.ts` caps concurrency per external provider (`openai`, `tavily`, `prospeo`, `hunter`) so a big graph can't blow through free-tier limits.

**Stage by stage:**
1. `find_accounts` → `agents/accountAgent.ts` (uses `tools/openai.ts` web_search) → real companies scored vs. the anchor (default SQM).
2. `research_account` + `find_contacts` (parallel, per account) → `agents/researchAgent.ts` / `agents/contactAgent.ts` (web search + Tavily LinkedIn-restricted search).
3. `evaluate_strategy` → `agents/strategyAgent.ts` — real weighted scoring (ICP fit, evidence quality, operational pain, FlytBase relevance, contact readiness) → **pursue / needs_more_research / reject**. On `needs_more_research`, the Planner adds exactly one bounded retry (`research_strategy_gaps` / `search_strategy_contacts`), never an open-ended loop.
4. `find_email` → `agents/emailFinderAgent.ts` → `tools/emailFinder.ts` (Prospeo → Hunter waterfall — **just fixed, see section 7**). Never invents an email; honest "not found" otherwise.
5. `write_and_critique_email` → `agents/criticAgent.ts` → writer (`skills/emailWriting.ts` + `skills/proofLibrary.ts`) drafts the cold email with a clear CTA (real Calendly link, see section 5), critic (`skills/critic.ts`) checks it, one rewrite max. Then, same call, generates **3 follow-ups** (`skills/followUpWriting.ts`), same sender identity, same research, each also critiqued.
6. `runtime/persistResults.ts` → the cold email + accounts/contacts/research go through the existing `import_run_results` Postgres RPC (one call); the 3 follow-ups are inserted directly afterward (`tools/supabase.ts`'s `getContactIdByEmail` + `insertFollowUpEmail`), since the RPC returns void and never hands back the new contact's ID.
7. Frontend reads the production tables directly via Supabase client (no backend involved for reads) — `frontend/src/routes/_authenticated/drafts.tsx` + `EmailCard.tsx` render a toggle: Cold Email / Follow-up 1 / 2 / 3, per contact.

`agents/reflectionAgent.ts` and `runtime/runAnalytics.ts` (+ `npm run analyze`) form the cross-run feedback loop: aggregates real critic failures / strategy rejections / evidence gaps across past runs into a report. **Deliberately does not edit its own prompts or thresholds** — a human reads it and decides what to change in `skills/` or `agents/strategyAgent.ts`. This was a deliberate design choice, not a shortfall (see section 7).

Tests: `npm test` runs `tests/plannerAgent.test.ts` + `tests/strategyAgent.test.ts` (real assertions on the scoring/retry logic, no mocks needed since they're pure functions).

---

## 4. The 4-touch email sequence (built this session)

Every contact with a resolved email now gets a full thread, not one email:
- **Touch 0 (cold email):** full SMYKM structure (specific sourced hook → real FlytBase proof point → **clear call-to-action** ending on `https://calendly.com/manas463jaiswal/30min`, a real, verified, live Calendly link — verified by actually loading it in a browser, not assumed).
- **Touches 1-3 (follow-ups):** shorter, casual, built from real templates the user provided (plain follow-up → check-in → final light nudge), same sender name throughout, same underlying research/mechanism, not full SMYKM (that's intentional — follow-ups were never meant to re-run the full framework).

DB: `emails.sequence_index` (0-3). Frontend: `EmailCard.tsx` shows tabs only when more than one touch exists for a contact.

**Real verified example, if you need one for a demo:** run `f8d273c9-3e6f-4022-820a-23ae5a836740`, contact Jérôme Pécresse / Rio Tinto (Rincón lithium project), all 4 rows confirmed directly against the DB, cold email cites a real US$1.175B financing figure.

---

## 5. The hackathon submission — status

Five required deliverables:
1. **Submission.md** — done, `docs/Submission.md`, describes what was built, the SMYKM→clear-CTA change, the 4-touch sequence, the Render deployment, real results (including the Rincón/Pécresse example), and honest limitations.
2. **Mind map / flowchart** — `docs/mindmap.html`. Note: this file has been **rewritten by the user/Codex outside this session** more than once — the current version on disk is theirs, not mine. Don't overwrite it without being asked.
3. **GitHub repo** — `https://github.com/Manas463/flytbase-agentic-platform`, confirmed up to date (local HEAD matches `origin/main` as of the last check).
4. **Live deployed link** — `https://flytbase-agentic-platform-1.onrender.com`. **Blocked on the reviewer-access gap in section 2** until resolved.
5. **5-minute walkthrough video** — not recorded yet. A personal-reference draft exists at `docs/FlytBase_5-Minute_Walkthrough.html` (gitignored, never pushed, that was explicit).

---

## 6. Known current issues (as of the last message in the prior session)

- **Hunter.io quota exhausted** — confirmed live via a real `429 too_many_requests` call. This is an actual billing-period limit, not fixable in code. Resets next cycle, or needs a plan upgrade. Ask before assuming it's fixed; verify with a live test call the same way it was diagnosed (see `tools/emailFinder.ts`'s `verify()`/Hunter calls).
- **Prospeo's old `/email-finder` endpoint was removed by Prospeo** — this was the actual root cause of a run that produced 8 accounts but 0 emails. **Already fixed** (commit `a5fc1f8`): migrated to `/enrich-person`, verified live against a real contact before trusting the new shape. Also made `resolveEmail()` skip the Hunter verify call when Prospeo's own `person.email.status` already says `"VERIFIED"` — reduces Hunter dependency, which matters while its quota is out.
- **Reviewer access** — no self-serve signup on the live frontend; unresolved (section 2).
- Several files (`agents/accountAgent.ts`, `researchAgent.ts`, `contactAgent.ts`, `strategyAgent.ts`, `reflectionAgent.ts`, `plannerAgent.ts`, `runtime/persistResults.ts`, `runtime/sharedMemory.ts`, `runtime/runAnalytics.ts`, `runtime/analyzeCli.ts`, `docs/mindmap.html`) have been edited directly by the user or by Codex working in parallel, outside this chat, more than once. **Always re-read a file directly before editing it** if there's any chance it changed since last seen — don't trust memory of its contents across a long session.

---

## 7. Working principles established over this whole build (follow these)

- **Anti-fabrication is the top-level constraint.** Every account/contact/research claim needs a real source or an honest "not found." Never invent a URL, an email, or a persona.
- **Enforce hard rules in code, after the model call — never trust the prompt alone.** This failed twice already: em-dashes leaking through despite an explicit "no em dashes" instruction (fixed with a deterministic regex strip), and the critic dumping all-PASS checklist items into `failures` despite "empty array if pass=true" (fixed by forcing `failures=[]` in code when `pass===true`). If you're tempted to fix something with "a stronger prompt," don't — fix it in code.
- **Verify against the live system before trusting a change**, especially anything touching an external API or a deployed service. This session repeatedly caught real bugs this way: a fake FK-violation test before a real DB write, a live curl to Calendly before trusting the link, a live curl to Prospeo/Hunter before believing "the email finder is broken" vs. "the orchestration is broken." Don't guess API shapes from memory — hit the real endpoint and read the real response.
- **Small, real git commits, pushed promptly.** The user works in parallel with Codex on this same repo; uncommitted work is a real risk of loss or conflict. Commit and push often, with commit messages that explain *why*, not just *what*.
- **Don't build the "self-improving" pieces as self-editing.** The Strategy Agent's retry loop and the cross-run analytics tool are both intentionally human-in-the-loop, not autonomous prompt-rewriters. This was a deliberate call, argued for explicitly, not an oversight — don't "improve" it into something that edits its own instructions without being asked.
- **Ask before spending real API credits** on a full campaign run, and before doing anything hard-to-reverse (deleting data, force-pushing, changing account/auth settings). The user has consistently wanted to be asked first, then move fast once confirmed.

---

## 8. Immediate open threads, if you're picking this up fresh

1. Resolve the reviewer-access gap (section 2) before the hackathon submission is considered fully complete.
2. Record the 5-minute walkthrough video.
3. Confirm whether Hunter's quota has reset or been upgraded; if not, the system currently runs on Prospeo alone for email-finding, which does work but is a single point of failure.
4. `docs/mindmap.html` is currently the user/Codex's version — check with them before touching it.
5. Nothing else is currently broken as of the last verified state (typecheck clean, tests passing, both Render services live and talking to each other, email finder fixed and verified).
