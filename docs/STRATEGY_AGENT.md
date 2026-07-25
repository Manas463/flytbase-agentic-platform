# Strategy Agent and Evidence-Gap Loop

The Strategy Agent is the gate between evidence collection and paid or
credit-limited email resolution/writing. It consumes a sourced account,
company research, and sourced role-fitting contacts from Shared Memory.

## Scorecard

| Criterion | Weight | What earns credit |
|---|---:|---|
| ICP fit | 30 | Existing SQM-benchmarked ICP score |
| Evidence quality | 20 | Grounded account sources, claim-level evidence, sourced hook |
| Operational pain | 20 | Hazard/24-7 context, contracted crews, sourced operating evidence |
| FlytBase relevance | 20 | Sourced hook, technology signal, inspection/monitoring mechanism match |
| Contact readiness | 10 | Sourced role-fit, role diversity, site specificity |

The pursue threshold is 70. A score at or above 70 still cannot pass while a
high-priority evidence gap remains.

## Verdicts

- `pursue`: qualification passed; email resolution and writing may begin.
- `needs_more_research`: the verdict includes exact gaps and targeted
  questions; the Planner expands the graph for the responsible agents.
- `reject`: a hard rule failed, the score cannot qualify, or the retry limit
  was exhausted. No downstream email task is created.

## Learning loop

```text
Research + contacts
        ↓
Deterministic scoring
        ↓
needs_more_research
        ↓
Gap → owner → targeted question
        ↓
Targeted research/contact task
        ↓
Merge only grounded evidence
        ↓
Re-score once → pursue or reject
```

Shared Memory retains the latest verdict, every attempt, and the reflection
for each attempt. This makes recurring gaps measurable across runs while
keeping policy changes human-controlled. The loop never rewrites its own
weights, prompts, source gates, or retry budget.

## Structural safeguards

- Account, research, and contact URLs must come from the corresponding
  grounded search call; plausible model-created URLs are discarded.
- One retry is allowed per account.
- Rejected accounts never create email-resolution or writing tasks.
- Missing evidence stays missing; the runtime never fills a gap with an
  inferred claim.
