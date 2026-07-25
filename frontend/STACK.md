# Stack & tooling — what we use and why

This documents every tool in the FlytBase BDR outbound-agent system and the reason it's there. The system has two halves: the **agent** (an n8n workflow that does the real work) and the **frontend** (this repo, which triggers runs and displays results). They meet at **Supabase**, which both read/write.

## The pipeline flow, end to end

```
User clicks "Run Campaign" (frontend)
   → POST to n8n webhook
   → n8n creates a "running" row in Supabase (runs table)
   → n8n pipeline: find accounts → research → find contacts → write + critique emails
        (GPT-4.1 for reasoning/generation, Tavily for LinkedIn, Prospeo+Hunter for emails)
   → n8n writes results to Supabase (accounts / research / contacts / emails) + Google Sheet
   → n8n flips the run to "done"
   → frontend polls the run, then displays accounts, dossiers, contacts, ready-to-send emails
```

## Tools

| Tool | Role in the system | Why this one |
|---|---|---|
| **n8n (Cloud)** | The agent itself — a visual workflow that orchestrates every stage (account sourcing, research, contact discovery, email writing + critic). | The assignment requires *inspectable* logic, not a black box. n8n's node graph is self-documenting and easy to demo live; deterministic step-sequencing keeps a multi-stage LLM pipeline reliable. Hosted on Cloud so the webhook is publicly reachable for the frontend. |
| **OpenAI GPT-4.1** (Responses API + `web_search`) | The reasoning/generation engine: finds candidate accounts, structures research, structures contacts, writes each email, and runs a critic pass. | Strong reasoning plus built-in web search means every account and research point can be pulled from *real, cited* sources rather than invented — the assignment disqualifies fabricated data. |
| **Tavily** | Web/LinkedIn-restricted search for contact discovery. | Surfaces real decision-makers (name + role + LinkedIn) with source URLs, so contacts are verifiable, never invented. |
| **Prospeo + Hunter.io** | Email find + verify, run as a waterfall (Prospeo primary, Hunter fallback + verification). | Real, deliverable emails with a verification status. When no email can be verified, the contact is marked `not_found` rather than guessed — honesty over coverage. |
| **Google Sheets** | A human-readable export of each run (one row per contact). | A zero-friction artifact a non-technical reviewer can eyeball; kept as a bonus output alongside the database. |
| **Supabase** | The shared backbone: a Postgres database (run outputs) **and** authentication (the login gate). | Postgres with row-level security means the frontend can read data directly and safely with just a public anon key — no custom backend needed. Instant REST API, generous free tier, and native Lovable integration. |
| **Lovable** | AI app builder that scaffolded this frontend and its Supabase wiring. | Fastest way to get a polished, real React app (auth, routing, data fetching, design) instead of hand-building boilerplate. Two-way GitHub sync means the code is portable out of Lovable at any time. |
| **TanStack Start / React / Vite / TypeScript** | The frontend framework and build tooling (Lovable's template). | Modern, type-safe, file-based routing with SSR; Vite for fast builds. |
| **Tailwind CSS + shadcn/ui** | Styling and UI components. | Lets the app match a deliberate design system (see `.claude/skills/frontend-design`) quickly and consistently. |
| **GitHub** | Source of truth for the frontend code; also the "inspectable system access" deliverable. | The assignment accepts a repo link as proof of working, inspectable logic. Two-way synced with Lovable. |
| **Cloudflare Pages** | Hosting for the deployed frontend (the live link). | This app is server-rendered (TanStack Start), and its build already targets Cloudflare by default — so Cloudflare Pages is the least-friction way to get a stable public URL. |
| **Claude Code** | The development/orchestration assistant used to design the architecture, build the Supabase schema + n8n write-back, mold the design system, and continue development after Lovable. | Keeps the whole multi-tool build coherent — one place that understands how n8n, Supabase, and the frontend fit together. |

## Design decisions worth knowing

- **No custom backend.** The frontend talks only to Supabase (via the public anon key + row-level security) and to the n8n webhook. This keeps the moving parts minimal.
- **Async + poll, not a held-open request.** A run takes minutes, so the webhook returns immediately with a run id and the frontend polls for completion — robust against timeouts, and it can surface exactly where a run failed.
- **Only `target_vertical` is user-editable.** The reference account (SQM) and the rest of the campaign brief are fixed in n8n's `Build Brief` node, so the ICP benchmark stays consistent across runs.
- **Nothing fabricated.** Every account/research claim carries a source URL; contacts and emails come from real providers or are marked not-found. This is the core bar the whole system is built to clear.
