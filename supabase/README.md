# Supabase

This directory contains database migrations for the builder backend.

## M0 schema

- `migrations/20260220223500_m0_core_schema.sql`
  - Creates core tables: `app_users`, `projects`, `builder_sessions`, `project_artifacts`, `session_messages`, `session_events`
  - Adds indexes, `updated_at` triggers, and service-role RLS policies

## Runtime data access policy

- Application runtime uses server-only Postgres access via `DATABASE_URL`.
- Do not rely on browser-side Supabase client auth/anon-key data access for core app persistence paths.

## Apply migrations

```bash
supabase link --project-ref lgbhhcpqxghaqsqkkdgn
supabase db push
```

If you prefer psql directly, run the SQL file against your Supabase Postgres connection string.
