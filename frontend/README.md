# frontend/

The existing deployed app already lives at `~/pipeline-review` (React + TanStack Start, Supabase-wired, deployed to Cloudflare Workers). Connect the new agent runtime to it rather than rebuilding it, per the charter's "reuse existing assets" instruction. Design system: `Eyebrow` / `SectionTitle` / `Divider` / `Stat` / `Pill` in `pipeline-review/src/lib/ui.tsx`, flat/dotted/monospace aesthetic, reuse it for any new UI.
