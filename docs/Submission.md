# Submission

## What I built

A working AI agent system for FlytBase's outbound BDR motion into Latin American mining: given a target vertical and a reference account (SQM), it automatically finds similar target companies, the right decision-makers at each, real researched context on each account, and personalized cold outbound emails, end to end, with zero fabricated data anywhere in the chain.

This exists in two forms:
1. **The original working n8n workflow** (`flytbase-bdr-agent.n8n.json`) — built first, hardened over many iterations, and used to generate the real accounts/contacts/emails this project has been validated against.
2. **A TypeScript multi-agent platform** (this repo: `agents/`, `skills/`, `tools/`, `runtime/`) that ports the n8n pipeline's hardened logic into real, tested, version-controlled code, adds a genuine agentic architecture on top (a Planner-driven dynamic task graph, a real Strategy Agent with weighted scoring and a gap-driven retry loop, and a human-in-the-loop cross-run feedback system), and consolidates the full stack, frontend, backend, and agent runtime, into one repository.

## How I approached it

Started from the assignment's four required stages (Account Identification, Contact Discovery, Account Research, Personalized Email Generation) and built the n8n version first, since a working system beats a diagram. From there:

- Replaced an unreliable Tavily-only email-finding step with a real Prospeo → Hunter waterfall (domain search, email finder, verification).
- Discovered, via real cross-referencing of pipeline output, that prompt-only enforcement of hard rules fails silently: the "no em dashes" rule and the "exclude suppressed/existing customers" rule both leaked through the model despite explicit instructions. Both were fixed the same way, moved from the prompt into deterministic code that runs after the LLM call. This became a standing principle for the rest of the project.
- Read FlytBase's own real case studies (SQM, Anglo American, CSX, Shell) rather than assume, which surfaced two concrete corrections: a fourth genuine decision-maker role family (Digital Transformation Lead) that the original brief didn't name but the real SQM deployment was actually driven by, and replaced generic "logo drop" proof points with mechanism-matched citations (e.g., Anglo American's Quellaveco drone-survey case for a prospect with active-pit-face terrain, not just "a big miner uses FlytBase too").
- Adopted Sam McKenna's SMYKM cold-email method for the writer: open with a specific, sourced detail about the account, connect it to a real FlytBase mechanism, close with one soft question rather than a hard CTA.
- Migrated the hardened logic into TypeScript once the assignment evolved into a broader agentic-platform build: every skill (`icpScoring`, `roleFit`, `proofLibrary`, `emailWriting`, `critic`) is a direct, tested port of the corresponding n8n Code node's logic, not a rewrite from scratch.
- Built the genuinely new pieces the agentic architecture called for: a real Strategy Agent (weighted scoring across ICP fit, evidence quality, operational pain, FlytBase relevance, and contact readiness, with a bounded retry loop that sends thin accounts through one targeted extra research pass rather than rejecting on a single incomplete signal), a Planner that actually drives execution via a dependency-aware task graph (not just a diagram sitting next to hand-written orchestration code), and a cross-run analytics/feedback module that surfaces real patterns (critic failures, strategy rejections, unresolved contacts) for a human to act on.
- Consolidated the previously-separate frontend (React/TanStack Start, Cloudflare-hosted) and a newly-built backend (a plain Node HTTP server exposing the one endpoint the frontend needs) into this single repository, replacing the direct-to-n8n-webhook trigger with a real backend call.

## Why I made these decisions

The assignment's one hard disqualifier is fabricated data, so every architectural choice was evaluated against it first. That's why: every account carries real source URLs or gets dropped; every research claim is either sourced or explicitly marked as a gap; contacts require a real evidence source backing both name and role; emails are never sent automatically, a human reviews and sends; and the Strategy Agent's retry loop exists specifically so a real, qualifying account isn't rejected just because the first research pass came back thin, without ever inventing evidence to fill the gap.

The "enforce in code, not the prompt" principle recurred often enough that it shaped the newest work too: while building the cross-run feedback loop, its very first real report caught the critic model dumping all 11 checklist items into its `failures` array (labeled "PASS") even on emails that fully passed, the exact same failure shape as the earlier em-dash and suppression leaks. Fixed the same way: force the correct behavior in code immediately after the model call, rather than trust a stronger prompt.

## Results achieved

Real, live runs, not simulated output: an actual run against the SQM/LATAM mining brief found 8 real accounts (Vale S.A., Codelco, Sigma Lithium Corporation, Lithium Argentina AG, Antofagasta Minerals, Zijin-Liex, Samarco Mineração, CSN Mineração), each ICP-scored against SQM with cited evidence, generated 5-8 real personalized emails per run, and persisted the full result into the same production Supabase tables the live dashboard reads. Verified the critical `import_run_results` database contract with a full write/read/cleanup round-trip before ever risking it on a real campaign.

The feedback-loop tool's first real use, aggregating across the first 13 generated emails, surfaced that "value angle is not singular" was the single most common critic objection (4 of 10 substantive failures), a real, actionable, non-obvious signal that led to a deliberate loosening of both the writer prompt and the critic checklist, on the actual editorial judgment that a second angle is fine when it's genuinely grounded in that account's real situation, not a generic list.

## Intended outcome vs. actual outcome

Intended: a fully agentic, self-improving multi-agent platform. Actual: a real, tested, working multi-agent pipeline with genuine concurrent execution (a dependency-aware task graph, not hand-nested async calls) and a real Strategy Agent gate with an evidence-driven retry loop, but the "self-improving" piece was deliberately built as a human-in-the-loop report generator rather than a system that edits its own prompts or logic automatically. Given this project's own repeated experience with what happens when a rule is left purely to the model to follow, letting the system silently rewrite its own instructions felt like the same risk one level up, not a shortcut worth taking.

## What I'd improve with more time

A multi-touch follow-up sequence (4-7 escalating emails per contact, soft warm-up through to an explicit call/demo ask) was scoped in detail but not yet implemented. Sender-identity rotation is generated by the writer but intentionally not threaded through to storage, since a real human sends every email manually and the rotation only needed to vary voice, not produce a literal multi-persona record. Backend deployment (a real always-on Node service, since a campaign run takes 1-2 minutes across several external APIs, longer than a typical serverless execution window comfortably allows) was finished under real time pressure at the very end of the build.
