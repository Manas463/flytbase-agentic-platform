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
