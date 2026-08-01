# database/

Schema and migrations. Reuse the existing Supabase schema (project `zvlchtfozsbjffxkirme`: `runs`, `accounts`, `contacts`, `emails`, `research`) as the base for Shared Memory rather than inventing a parallel structure.

One new table has actually been added so far, a generic key-value store rather than one table per agent (simpler to extend as the Strategy/Reflection agents' output shapes are still first drafts, see `agents/strategyAgent.ts` and `agents/reflectionAgent.ts`):

```sql
create table if not exists run_memory (
  run_id uuid not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (run_id, key)
);
```

Run this against the existing Supabase project before using `runtime/sharedMemory.ts`. If a dedicated table per concept (`strategy_verdicts`, `reflections`) turns out to be worth the migration later, that's a deliberate upgrade from here, not a gap.

## Pending migrations

Two columns added to existing tables. Both are additive and safe to re-run.

```sql
-- Multi-touch email sequence: 0 = cold email, 1/2/3 = follow-ups.
alter table emails add column if not exists sequence_index integer not null default 0;

-- Dispersed physical footprint evidence (site area in km2/hectares, count of
-- separate sites, leach-pad / pond / pit scale). This is the evidence behind
-- the heaviest ICP signal, so it needs to be visible to a human reviewing why
-- an account qualified. See skills/icpScoring.ts ICP_WEIGHTS.inspectableArea
-- and footprintSignal() in agents/strategyAgent.ts.
alter table accounts add column if not exists site_area_evidence text;
```

`sequence_index` has been applied. **`site_area_evidence` has not** — until it is,
`updateAccountSiteArea()` in `tools/supabase.ts` logs a warning per account and
continues (deliberately non-fatal: it runs at the very end of a campaign, after
all API credits are spent, and losing one enrichment field beats discarding a
completed run).
