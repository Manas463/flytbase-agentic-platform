# HANDOFF — read this first, in a fresh session, before touching any code

This is the bridge document. Everything below happened across a very long prior session that is now out of context. Nothing here is guessed, it's all things that were actually built, tested, deployed, or decided. If you're Codex (or a fresh Claude session) picking this up in VS Code: read this whole file before writing anything, it tells you what already exists, what's already been decided, and what's actually being asked for next.

---

## 1. What this project actually is

This started as a FlytBase Business Development Representative (Outbound) take-home assignment: build a working AI agent that takes a campaign brief and automatically produces target accounts, target contacts, company research, and personalized outbound emails, for large-scale lithium/copper/iron-ore mining in Latin America, anchored on **SQM** (Sociedad Química y Minera de Chile) as the reference/ICP-benchmark company.

That assignment was completed, submitted, and the candidate is now past the initial screen and into deeper technical rounds. Along the way, the project grew into three layers:

1. **The n8n outbound pipeline** — the actual working agent (account discovery → research → contact discovery → email generation + critic). This is real, deployed, and has been hardened through many iterations. Full detail in section 3.
2. **A productized web portal** — a real deployed app (React/TanStack Start frontend + Supabase database + Cloudflare hosting) that triggers the n8n pipeline via webhook and displays its results. Full detail in section 4.
3. **A new initiative, just starting** — converting the above into an "AI-native multi-agent platform" per five planning documents the user just wrote (now copied into `docs/` in this project). This is the part that has NOT been built yet, it's what comes next. Full detail in section 6.

**The single most important constraint across all of this, never compromise on it:** every account, every research claim, every contact must be real and sourced, or explicitly marked as not found. Fabricated data of any kind is an automatic disqualifier per the original assignment, and the entire existing system was built around never violating this. Any new agentic architecture must preserve this as a first-class, structurally-enforced rule, not just a prompt instruction (see section 3.7 for why prompt-only enforcement isn't good enough).

---

## 2. Where everything actually lives

| What | Where |
|---|---|
| The working n8n pipeline (JSON export, source of truth) | `~/pipeline-review/flytbase-bdr-agent.n8n.json` (also on GitHub, see below) |
| The live n8n workflow itself (the thing that actually runs) | Hosted on n8n Cloud, triggered via webhook at `https://mj463.app.n8n.cloud/webhook/run-campaign`. **The JSON file above is a documentation/backup copy** — changes made to it locally do not take effect until manually pasted into the real n8n Cloud editor. This has been a recurring gotcha, don't assume editing the file changes live behavior. |
| The frontend + repo | `~/pipeline-review/` — GitHub repo `git@github.com:Manas463/pipeline-review.git`, on branch `main`, deployed to Cloudflare (Workers, via `npx wrangler deploy`, connected through Cloudflare's Git integration so pushes to `main` auto-deploy) |
| The database | Supabase project `zvlchtfozsbjffxkirme` — tables: `runs`, `accounts`, `contacts`, `emails`, `research` |
| This new agentic-platform project | `~/Desktop/flytbase-agentic-platform/` (just created, this handoff lives here) |
| Original planning docs (untouched) | Still on Desktop directly: `PROJECT_CHARTER.md`, `IMPLEMENTATION_BRIEF.md`, `ARCHITECTURE_DECISIONS.md`, `HACKATHON_PROBLEM_STATEMENT.md`, `REPOSITORY_ANALYSIS.md` — copies now also live in this project's `docs/` |
| Interview-prep documents (from the earlier assignment round) | Written earlier into `~/Desktop/flytbase_assignment/`, that folder has since been cleaned up by the user except for `analytics-page.patch` and `dashboard/`. If you need `AI_TOOLS_AND_PRODUCTIVITY.md` or `HUMAN_DECISIONS_AND_TWEAKS.md` content again, it was posted in full in chat and is summarized in section 5 below. |

**Auth already solved:** SSH key set up for GitHub (ed25519, no passphrase), remote already switched to `git@github.com:Manas463/pipeline-review.git`. Plain `git push`/`git pull` in `~/pipeline-review` just works now, no tokens, no keychain prompts. Do not reintroduce HTTPS remotes or personal access tokens, that was a whole saga, it's fixed, leave it fixed.

**Supabase env vars** (for local frontend dev in `~/pipeline-review/.env`, gitignored, never commit): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, plus non-`VITE_` server-side equivalents (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`) since server-side auth middleware reads the plain names directly via `process.env`, not `import.meta.env`.

---

## 3. The n8n pipeline, stage by stage, as it exists right now

Entry point is a **Webhook** node (`POST /run-campaign`), not the old form-trigger (there's a dead, disconnected `Campaign Brief Form` node still sitting on the canvas from an earlier design, ignore it, it has zero connections). Flow: `Webhook → Create Run (inserts a Supabase runs row, status=running) → Respond to Webhook (returns the run id immediately so the frontend can poll) → Build Brief → ...` the real pipeline.

### 3.1 Account Identification (Stage 1)
`Build Brief` (normalizes the campaign input; **SQM is hardcoded as the anchor here**, there is no form field for it anymore, it cannot drift) → `Build Finder Prompts` (derives the ICP inline from SQM, one prompt per commodity) → `GPT-4.1: Find Accounts` (live web search, not memory) → `Merge Finder Results` (builds a strict JSON schema, scores candidates against SQM: scale 40%, hazard/24-7 ops 30%, geography 20%, tech-adoption 10%) → `GPT-4.1: Structure Accounts` → `Parse Accounts` (the real gatekeeper: fuzzy-matches and drops suppressed/existing-customer companies including subsidiaries like "Anglo American – Minas-Rio", dedupes by domain, checks geography by actual operations not HQ since several majors are HQ'd abroad but mine in the region, ranks and keeps the top N).

### 3.2 Account Research (Stage 3 — runs before contacts, deliberately)
`Build Research Prompt` → `GPT-4.1: Account Research` (live search) → `Extract Research` → `Build Research Structuring Prompt` → `GPT-4.1: Structure Research` → `Parse Research Brief` (produces a structured brief with dated, sourced news items and one sourced "best hook", the strongest personalization signal). This runs before contact discovery so every contact, once found, already has the company's research attached.

### 3.3 Contact Discovery (Stage 2)
Two independent search channels: `Build Exec Search Prompt → GPT-4.1: Executive Search → Extract Exec Search` (general web search for named executives) and `Build Tavily Request → Tavily: LinkedIn Lookup → Attach Tavily Results` (LinkedIn-restricted search). Both merge into `Build Contacts Prompt`, which enforces: a person only counts if a source backs **both** their name and role, and `role_match` is locked to a JSON schema enum of exactly `operations / hse / site / digital_transformation / other`. `GPT-4.1: Structure Contacts` produces the tagged list. `Parse Contacts` is the deterministic enforcement: drops anyone tagged `other`, dedupes, validates LinkedIn URLs are real `/in/` profiles, and picks up to N contacts **maximizing role-family diversity** (multi-threading, one Ops-or-Site person plus one HSE-or-Digital-Transformation person rather than two of the same function), with site-specificity (does the contact's title/notes mention the same site named in the research) as the tiebreaker.

The **fourth role family, Digital Transformation / Innovation / CTO**, is not from the original brief. It was added after reading FlytBase's own published SQM case study and discovering the actual person who drove that real deployment, Rodrigo Toler, held that exact title, not any of the three roles (Ops/HSE/Site) the brief named. This is real evidence that large industrial buyers often champion new tech through a different internal channel than the one that operates it. Keep this role family in any redesign, it's not a guess, it's documented.

`Contact Found?` forks: verified contact → continue to email resolution; nothing verifiable → `Not-Found Log` with a reason, never faked.

### 3.4 Email resolution
`Resolve Email (Waterfall)` — only runs on already-verified contacts. For each one: get the account's domain (from Stage 1, or resolve via Hunter Domain Search, cached per company) → try Prospeo email-finder (primary, most free credits) → fall back to Hunter Email Finder → verify whatever comes back through Hunter's Email Verifier. The model never writes an email address itself, it's always resolved by a real provider or marked `not_found`. Expect most LatAm mining-exec emails to come back `accept_all` (unconfirmed catch-all domain), this is a real, expected limitation of free-tier tooling, not a bug, and it's an honest, defensible talking point.

### 3.5 Email Generation + Critic Gate (Stage 4)
`Build Writer Prompt` assembles: the verified research brief, the account's specific "best hook," FlytBase's real facts, and a **real case-study proof point** picked by mechanism-matching (not a commodity guess) from a hardcoded `PROOF_LIBRARY` of four real, fetched FlytBase case studies:
- **SQM** (Chile, iodine leaching/irrigation): 4x yield improvement, 99% faster inspection. Matched on leach/irrigation/brine/lithium keywords.
- **Anglo American** (Quellaveco, Peru, copper): eliminated truck-based terrain surveying, got crews out of hazardous field positions. This is the **default/fallback** proof point, closest mechanism match for generic hard-rock/open-pit miners. Matched on tailings/pit-wall/terrain/geotechnical keywords, but also falls back here if nothing else matches.
- **CSX** (US rail): defect detection to 1/8 inch without sending crews into yards. Matched on rail/logistics/port keywords.
- **Shell** (Rotterdam refinery): replaced twice-weekly manual tank inspections. Matched on refinery/tank/chemical-plant keywords.

Two of these four (Anglo American, Shell) have their strongest real quotes from the **implementation partner** (UAV LATAM, Skeye), not the client directly, if ever quoting verbatim, attribute correctly.

The writer is built on Sam McKenna's "Show Me You Know Me" (SMYKM) method: specific subject (rotates across 4 styles), non-salesy opener, transition (rotates, sometimes skipped entirely), a confident (not hedged, not neutral) case for the value, one pre-empted objection, and a considerate close with a broad timeframe (explicitly bans calendar links, specific times, "book a demo"). Value angle rotates across 5 options (save money, protect revenue, save time, raise their standing, keep people safe), and sender identity rotates across 4 names, so a batch never reads as one template. Target length is **80-150 words** (recently widened from 70-120). No em dashes, no buzzwords, no bullet lists, no bracketed placeholders ever.

`GPT-4.1: Write Email → Extract Email Draft → Build Critic Prompt → GPT-4.1: Critic Review → Parse Verdict` — a second, independent AI grades the draft against an 11-point checklist matching every rule above (explicitly told to reward conviction and structural variety, not punish it). `Critic Passed?` forks: pass → `Keep Draft As Final`; fail → `Build Rewrite Prompt → GPT-4.1: Rewrite Email → Extract Rewrite` (the rewrite reuses the entire original writer prompt verbatim plus an itemized list of what failed, so it never drifts from the original rules, there's no separately-hardcoded rule set to keep in sync).

`Join Email Branches` merges both paths → `Strip Em Dashes` (a deterministic regex step, added because prompt-level "no em dashes" instructions were empirically leaking in real output, this guarantees zero regardless of what the model does, this is the general lesson: **critical constraints need code-level enforcement wherever possible, prompt instructions alone are not reliable enough**) → `Assemble Campaign Output`.

### 3.6 Output
`Compile Research Documentation → Research Doc as File` (a readable audit-trail document). `Flatten Emails for Sheets → Google Sheets: Append Contacts` (one row per contact, keyed to update existing rows instead of duplicating on re-runs). `Build Run Payload` (groups accounts/research/contacts+emails into one shaped object) → `Import Results` (a single POST to a Supabase Postgres RPC function, `import_run_results`, passing the run id and payload, this is what the frontend actually reads).

### 3.7 The core lesson worth carrying into any redesign
Prompt instructions alone are not reliable for hard constraints. The em-dash rule leaked despite an explicit ban, until a deterministic code step was added. The suppression list leaked a subsidiary company name until a fuzzy-match filter was added in code. The pattern: **wherever a rule is genuinely non-negotiable (no fabrication, no banned formatting, no wrong-role contacts, no suppressed companies), enforce it in code after the LLM call, don't just ask the LLM nicely.** This should be an explicit architectural principle in the new agent design (see section 6 suggestions).

---

## 4. The productized frontend

Built by Lovable initially (scaffolded the React/TanStack Start app, Supabase wiring, the design system), then developed further directly in the repo. Real auth (Supabase), file-based routing (`src/routes/_authenticated/...`).

**Pages that exist:** Home (`/`, triggers a run via the webhook, polls for completion, shows the latest run's summary and totals), Accounts (`/accounts`, lists all sourced accounts with dedup), Drafts (`/drafts`, every generated email via an `EmailCard` component with Edit/Copy/"Send in Gmail" buttons, the Gmail button only renders if `contact.email` is non-empty, this is the real "don't send if no verified email" gate, implemented as conditional UI rendering, not a separate validation step), Analytics (`/analytics`, built later, real data: email verification breakdown, AI critic first-pass rate, role-fit distribution, commodity/country spread, runs history, plus an honestly-labeled "not connected yet" engagement section since no sending tool is wired in).

**Design system:** `Eyebrow` / `SectionTitle` / `Divider` / `Stat` / `Pill` components in `src/lib/ui.tsx`. Flat (radius 0), dotted borders/dividers, monospace `label` typography, serif section titles, oklch color tokens defined in `src/styles.css`. Any new UI should reuse these, not introduce a different visual language.

**Deliberately not built:** no automated sending. The system generates and verifies, a human clicks "Send in Gmail" themselves. This was a conscious ethical choice, not a missing feature, preserve it unless explicitly asked to change it.

**Engagement/analytics metrics (open rate, reply rate, etc.) are not live**, they require a sending tool (Smartlead or Instantly, genuinely not yet chosen) to be connected and writing into a new table. The Analytics page already has a clearly-labeled placeholder for this, don't fill it with fabricated numbers.

---

## 5. What's already been said/written for the human side of this (interview prep)

Two documents were written in full, in the user's own voice, for an interview round about the *original* assignment (not this new agentic initiative): **AI_TOOLS_AND_PRODUCTIVITY.md** (every AI tool used: Claude/Claude Code as the main dev partner, GPT-4.1 as the agent's reasoning engine, Gemini as the initial attempt before switching, Tavily for contact search, Prospeo+Hunter for email resolution, Lovable for the frontend scaffold) and **HUMAN_DECISIONS_AND_TWEAKS.md** (a full chronological log of every judgment call: bare-minimum-first philosophy, the GCP→Tavily pivot, removing the SMTP send branch on ethical grounds, hardcoding SQM, the hunter-voice and em-dash decisions, the anti-fabrication rule never traded off, the three-stage duplicate-contact fix, the transparency-over-silence extension email, deciding to productize past the assignment, the Digital Transformation Lead discovery, the Anglo American suppression bug catch, and refusing to accept a guessed case-study mapping without verifying it). Both were pasted in full in chat. If this context is needed again and the files aren't recoverable, ask the user, they have the chat history even if the files got cleaned up.

---

## 6. The new ask: turning this into an agentic multi-agent platform

Five planning documents (now in this project's `docs/` folder) lay out the next phase: replace n8n's fixed, sequential orchestration with a **Planner Agent** that builds a dynamic task graph, runs independent stages in parallel (ICP matching, account discovery, research, contact discovery), writes to a **Shared Memory** layer instead of passing prompts directly between stages, adds a **Strategy Agent** (decide whether to even pursue an account before writing to it, this doesn't really exist yet in the current system, it's new logic, not just an extraction), and adds a **Reflection Agent** that grades each stage's confidence/failures and feeds back into replanning.

Suggested repo layout (from `PROJECT_CHARTER.md`): `docs/ skills/ tools/ agents/ runtime/ database/ frontend/ backend/ artifacts/`, already scaffolded in this project folder.

**Read all five docs in `docs/` before writing any code.** They are internally consistent with each other (charter, brief, ADRs, hackathon statement, and repo analysis all tell the same story from different angles), but see the suggestions in section 7 below for gaps worth closing before implementation starts.

**Development phase order, per the charter:** (1) inspect the existing repo, (2) extract reusable logic, (3) implement planner/runtime, (4) convert workflow stages into agents, (5) add reflection loops, (6) connect the frontend, (7) deploy, (8) produce submission documentation. Section 3 of this handoff **is** step (1) and (2) already done, the extraction. Use it directly rather than re-reading the raw n8n JSON from scratch.

---

## 7. My honest suggestions on the five planning docs (asked for, given directly)

**On `PROJECT_CHARTER.md`:** strong vision, but it's missing three things that were hard-won in the existing system and must not get lost in the rewrite: (1) the anti-fabrication rule as an explicit, structurally-enforced guiding principle, not implied; (2) an explicit constraint about free-tier rate/credit limits (Prospeo, Hunter, Tavily, GPT-4.1 are all capped), since a naive "parallelize everything" agent redesign could blow through those limits far faster than the current batched, front-load-deduped design does; (3) "no automated sending, ever" as a stated principle, not an assumed one.

**On `IMPLEMENTATION_BRIEF.md`:** the future pipeline diagram is good, but be aware the **Strategy Agent is new business logic**, not something being "extracted" from the current system. The closest existing analog is the ICP scoring in `Parse Accounts`, but "should we pursue this account at all" as a discrete decision point doesn't exist today. Budget real design time for it, don't treat it as a mechanical conversion.

**On `ARCHITECTURE_DECISIONS.md`:** ADR-006 ("Writer never performs research") already matches the current system exactly, good. ADR-008 (skills vs. tools separation) is sound. Missing: an ADR codifying the lesson from section 3.7 above, that critical constraints (no fabrication, banned formatting, role-fit, suppression) need deterministic code-level enforcement after any LLM call, not just prompt instructions, since the current system had to learn this the hard way twice (em dashes, suppression fuzzy-matching).

**On `HACKATHON_PROBLEM_STATEMENT.md`:** this closely mirrors the original assignment brief but the deliverables differ in specifics (5-minute video here vs. 8-12 minutes originally, a `Submission.md` file here vs. a separate Campaign Strategy Document originally, no explicit mention of a strategy document at all here). Worth double-checking with the user whether this is a distinct, later-round hackathon with its own deadline, or a paraphrased restatement of the same brief, before building against deliverable specifics that might not be current.

**On `REPOSITORY_ANALYSIS.md`:** accurate. One addition worth making explicit: "minimal retry/reflection logic" is true, and the only existing precedent is the single critic→rewrite pass in Stage 4. That's a real, working pattern to generalize from (grade → itemize failures → retry once with the failures attached), not a from-scratch design problem, when building the Reflection Agent.

---

## 8. What to actually do next, concretely

1. Read this file fully, then read the five docs in `docs/`.
2. Do not start writing agent code before deciding, with the user, how the Strategy Agent's qualification logic should actually work, that's genuinely undesigned right now.
3. Reuse the exact prompt text and guardrail logic documented in section 3 wherever a new agent covers the same responsibility (e.g., the Contact Agent should carry over the role-fit enum, the multi-threading selection logic, and the site-specificity scoring verbatim, not reinvent it).
4. Keep the anti-fabrication and no-auto-send principles as hard, structural constraints in the new runtime, not prompts.
5. Reuse the existing Supabase schema (`runs`/`accounts`/`contacts`/`emails`/`research`) and the existing frontend rather than rebuilding them, per the charter's own "reuse existing assets" instruction, unless the new architecture genuinely requires schema changes (e.g., a `strategy_verdict` or `reflection_log` table would be new and reasonable additions).
6. Ask the user directly about the `HACKATHON_PROBLEM_STATEMENT.md` deliverables discrepancy noted above before finalizing what gets submitted and when.
