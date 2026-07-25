# PROJECT_CHARTER.md

# FlytBase Outbound AI Agent

## Vision

This project is **not** a migration of an n8n workflow. It is a redesign
into an AI-native multi-agent platform. The existing workflow has
already validated the business logic. The objective is to preserve that
logic while replacing the execution engine with an orchestrated,
observable agent architecture.

## Existing Assets

-   Existing frontend (Lovable, React + TanStack Start, deployed on Cloudflare Workers)
-   Supabase authentication & database (`runs`, `accounts`, `contacts`, `emails`, `research` tables, project `zvlchtfozsbjffxkirme`)
-   Existing deployed application (`github.com/Manas463/pipeline-review`, auto-deploys from `main` via Cloudflare's Git integration)
-   n8n workflow (source-of-truth export at `pipeline-review/flytbase-bdr-agent.n8n.json`; the live version runs on n8n Cloud behind a webhook, `POST /run-campaign`)
-   GPT-4.1 API (used for account finding, research, executive search, email writing, and the critic pass)
-   Tavily (LinkedIn/contact search), Prospeo + Hunter.io (email resolution waterfall + verification)
-   Existing prompts and business logic (see `HANDOFF.md` section 3 for the full stage-by-stage breakdown of what's already built and hardened)

Reuse these whenever possible. Do not re-derive prompt logic, guardrails, or scoring rules that already exist and have been tested against real output, port them, then improve them.

## Non-Negotiable Constraints

These are not implementation details, they are the rules the entire existing system was built around, and any redesign that violates them is a regression, not progress.

1. **No fabrication, ever.** Every account, every research claim, every contact must carry a real, verifiable source, or be explicitly marked as not found. This was the original assignment's stated automatic disqualifier, and it must remain a structurally-enforced property of the new architecture, not a prompt instruction that an agent might ignore under pressure to produce output.
2. **No automated sending.** The system generates and verifies outbound emails; it does not send them. A human reviews and sends manually. This is a deliberate, permanent design decision, not a missing feature to "complete" later.
3. **Respect free-tier rate and credit limits.** Prospeo, Hunter, Tavily, and the GPT-4.1 API all have real, low free-tier ceilings. The current system is deliberately batched, deduplicated, and front-loaded (checking what's already been processed before spending anything further) to stay within them. A naive "parallelize everything" agent redesign can burn through a month's credits in one run if this isn't carried forward as an explicit constraint on the Planner and Scheduler.
4. **Critical rules get enforced in code, not just in prompts.** The existing system learned this the hard way twice: an explicit "no em dashes" prompt instruction still leaked in real output until a deterministic regex step was added after generation; a suppression list (existing customers to exclude) still let a subsidiary name through until a fuzzy-match filter was added in code. Anywhere a rule is genuinely non-negotiable (fabrication, banned formatting, wrong-role contacts, suppressed companies, sending), enforce it with a real check after the LLM call, never trust the instruction alone.

## Target Architecture

User → Planner → Dynamic Task Graph → Specialized Agents → Shared Memory
→ Reflection → Validation → Final Output

## Repository Layers

1.  Knowledge
2.  Skills
3.  Tools
4.  Agents
5.  Runtime

## Suggested Folder Structure

``` text
docs/
skills/
tools/
agents/
runtime/
database/
frontend/
backend/
artifacts/
```

## Agents

-   Planner
-   ICP Agent
-   Account Agent
-   Research Agent
-   Contact Agent
-   Strategy Agent
-   Writer Agent
-   Critic Agent
-   Reflection Agent

### Notes on carrying over existing logic per agent

- **ICP Agent / Account Agent** — port the SQM-benchmarked scoring (scale 40%, hazard/24-7 ops 30%, geography 20%, tech-adoption 10%), the per-account source requirement, the domain-based dedup, the operations-based (not HQ-based) geography check, and the fuzzy suppression filter, directly from the existing `Merge Finder Results` / `Parse Accounts` logic. SQM stays hardcoded as the fixed anchor.
- **Research Agent** — runs before the Contact Agent, deliberately, so every contact is enriched with its company's research the moment it's found. Port the dated, sourced news requirement and the sourced "best hook" concept.
- **Contact Agent** — port the four role families (Operations, HSE, Site Director, **and Digital Transformation / Innovation Lead**, the fourth one added after reading FlytBase's own SQM case study and finding the real champion held that title, not one of the original three), the dual-source requirement (name AND role both sourced), the LinkedIn profile validation, and the multi-threaded diverse-role contact selection with site-specificity as a tiebreaker.
- **Strategy Agent** — this is genuinely **new** logic, not an extraction. The current system doesn't have a discrete "should we pursue this account" gate beyond the ICP score. Design this properly, budget real time for it, don't treat it as mechanical porting.
- **Writer Agent** — port the SMYKM (Show Me You Know Me) structural method, the rotating variety controls (value angle, subject style, transition, sender identity), the real case-study `PROOF_LIBRARY` (SQM, Anglo American, CSX, Shell, each matched by mechanism to the account's research signal, not a commodity guess), the 80-150 word target, and the hard formatting bans (no em dashes, no buzzwords, no bracketed placeholders, no pushy CTAs).
- **Critic Agent** — port the 11-point SMYKM checklist, and the instruction to reward conviction and structural variety rather than penalize them.
- **Reflection Agent** — the only existing precedent is the single critic-to-rewrite pass in the current Writer stage (grade, itemize failures, retry once with those failures attached). Generalize that pattern to other stages rather than designing reflection from nothing.

## Shared Memory

Stores: - Campaign - Accounts - Contacts - Research - Evidence - Email
drafts - Validation - Reflections

Suggestion: model this on the existing Supabase schema (`runs`, `accounts`, `contacts`, `emails`, `research`) rather than inventing a parallel structure, add new tables only where genuinely new state is needed (e.g., a `strategy_verdicts` table for the new Strategy Agent, a `reflections` table for retry/confidence logs).

## Self-Improvement Loops

-   Planner → Observe → Replan
-   Research → Evidence Score → Retry
-   Contact Search → Fallback Strategy
-   Writer → Critic → Rewrite
-   Reflection → Planner Feedback

## Runtime

Planner creates a task graph. Scheduler executes independent tasks in
parallel. Agents write only to shared memory. Planner continuously
observes execution and adapts.

Scheduler must be rate/credit-aware (see Non-Negotiable Constraints above), parallelizing account discovery, research, and contact discovery is good for latency, but each still calls the same rate-limited free-tier APIs underneath, the Scheduler needs to throttle real concurrency against those limits, not just against task-graph dependencies.

## Development Phases

1.  Inspect existing repo
2.  Extract reusable logic
3.  Implement planner/runtime
4.  Convert workflow stages into agents
5.  Add reflection loops
6.  Connect frontend
7.  Deploy
8.  Produce submission documentation

Steps 1 and 2 are largely done already, see `HANDOFF.md` in this project for the full stage-by-stage extraction of the existing n8n pipeline's logic, prompts, and guardrails. Start from that rather than re-reading the raw workflow export from scratch.

## Guiding Principles

-   Prefer evolution over rewrite.
-   Avoid one "super agent".
-   Separate reasoning (skills) from execution (tools).
-   Everything should be observable and logged.
-   Fabrication is never acceptable, structurally enforce it.
-   Sending remains manual and human-triggered; the system never sends on its own.
-   Design for the real rate/credit ceilings of the underlying free-tier tools, not for unlimited parallel calls.
