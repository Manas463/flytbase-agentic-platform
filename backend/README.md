# backend/

Whatever server-side glue the new runtime needs beyond Supabase's own REST/RPC layer (the existing pipeline already writes via a single `import_run_results` Postgres RPC call). Keep the webhook contract the frontend already depends on (`POST /run-campaign` returns a run id immediately, frontend polls) unless deliberately changing it.
