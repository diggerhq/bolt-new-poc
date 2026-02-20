# IMPLEMENTATION_PLAN.md

## Purpose

This document is the active execution tracker for building the Lovable/bolt.new-style app-builder product.

Use it for:
- Design details that are expected to evolve
- Milestones and task status
- Current sprint focus
- Progress updates and blockers

Do not use this file for long-term repo policy; keep durable guidance in `AGENTS.md`.

---

## Status legend

- `todo` — not started
- `in_progress` — actively being worked
- `blocked` — waiting on dependency/decision
- `done` — completed and validated

---

## Product scope (MVP)

- Prompt -> working app preview
- Chat-driven iterative edits
- Trace/action timeline in UI
- Debug loop (logs/errors -> fix request)
- Deploy pipeline (sandbox preview -> separate production target)

---

## Architecture sketch (first approximation)

- Next.js web app (UI + thin API/BFF layer)
- WorkOS AuthKit for user/session identity
- Supabase Postgres for app data via server-only `DATABASE_URL` access
- Sandbox provider adapter (E2B first)
- Sandbox-resident harness app (`harness/`) using Claude Agent SDK
- Agent orchestration loop (initially in-process)
- Preview surface (sandbox URL for dev)
- Deploy adapter (production target, separate from sandbox)

---

## Delivery strategy (Progressive JPEG)

- Build a complete, deployable end-to-end slice first, even with stubs/dummy internals
- Optimize for integrated flow over component depth in the first pass
- Keep interfaces stable while replacing stubs with real implementations
- Improve one subsystem at a time after first approximation is live
- Log every sandbox mismatch/gap in `SANDBOX.md`

---

## Default stack choices

- Web UI/runtime: latest stable Next.js (App Router)
- Database: Supabase Postgres (project/session/chat/trace storage) via server-only access
- Authentication: WorkOS
- Sandbox: E2B (first provider for M1)
- Deploy target: separate from sandbox (`todo` choose)

---

## Assumptions and caveats

- Assumption: backend complexity can stay low because sandbox handles compute/exec/filesystem/ports.
- Clarification: mostly true for execution primitives, but backend still owns orchestration, authz, state, trace persistence, retries/timeouts, and deploy coordination.
- Data access policy: server-only DB usage through `DATABASE_URL` (no Supabase anon-key/browser data path).
- Assumption: user-built app can be served from sandbox for development.
- Decision: yes for the first approximation; start with provider URL/port exposure in dev, and record any need for stable/public/policy-gated URLs in `SANDBOX.md`.

---

## Progressive milestones

### M0: End-to-end skeleton with stubs (`done`)

Goal: all major components exist and work together in one flow.

- `done` Next.js builder UI shell (prompt/chat/preview/timeline panes)
- `done` WorkOS AuthKit sign-in + protected builder route
- `done` Supabase schema v0 (users, projects, sessions, messages, events)
- `done` API endpoints with stubbed agent/sandbox/deploy behavior
- `done` Trigger prompt -> "fake generated app" -> preview panel wired
- `done` Validate local lint + production build for M0
- `done` Replace custom WorkOS OAuth handling with WorkOS AuthKit callback + middleware
- `done` Remove custom auth cookie/session state handling in app code
- `done` Handle stale/expired auth callback codes by restarting sign-in flow
- `done` Normalize API routes to `/api/*` (removed `/api/m0/*` prefix)
- `done` Simplify builder header UI (removed stack tags and M0 label)
- `done` Add Supabase-backed builder store and wire API/preview reads+writes
- `done` Remove Supabase API client usage and switch builder store to direct server-side Postgres (`pg` + `DATABASE_URL`)
- `done` Deploy first approximation to a hosted environment (Vercel project `bolt-new-poc-web`)

Exit criteria:
- User can sign in, create a project, submit prompt, see timeline events, and open a preview URL (stubbed output acceptable)

### M1: Real sandbox execution loop (`in_progress`)

Design decisions (locked for first M1 slice):
- `done` Provider choice: E2B
- `done` Harness shape: separate app in `harness/` using Claude Agent SDK
- `done` Harness runtime model: execute harness inside the sandbox (not on web server host)
- `done` Sandbox workspace layout:
  - `/workspace/app` -> generated user project
  - `/workspace/harness` -> harness runtime code
  - `/workspace/.builder` -> runtime metadata/log files
- `done` Turn execution protocol: one sandbox turn-runner command per user message (`run-turn`), serialized per session
- `done` Trace/progress transport: structured JSONL events from harness stdout -> persisted to `session_events`
- `done` Preview strategy: run dev server for `/workspace/app` in the same sandbox, expose port via E2B, persist URL to `builder_sessions.preview_url`
- `done` Concurrency rule: strict per-session lock + FIFO message queue while a run is active

Implementation tasks:
- `todo` Scaffold `harness/` app and `run-turn` entrypoint with Claude Agent SDK
- `todo` Add E2B adapter in web backend (sandbox create/resume, file sync, process exec, port exposure)
- `todo` Add runtime metadata persistence for sandbox/session/run bookkeeping
- `todo` Implement session bootstrap: create sandbox, sync harness + app scaffold, start dev server, save preview URL
- `todo` Implement message-run loop: enqueue message, execute turn-runner, update session status
- `todo` Persist live harness events into `session_events` and show in timeline
- `todo` Add timeout/kill/retry safeguards for sandbox commands and stuck turns

Exit criteria:
- Prompt + follow-up messages produce real file edits in E2B sandbox
- Builder timeline shows real in-progress and completion events from harness
- Preview URL serves app output from the same sandbox session
- Failed turns produce actionable trace events and can be retried

### M2: Real iterative agent and debug loop (`todo`)

- `todo` Implement repeated chat -> edit -> run cycle
- `todo` Implement "fix it" flow from runtime errors
- `todo` Add retry strategy and minimal rollback checkpointing

Exit criteria:
- User can iterate multiple turns and recover from common runtime failures

### M3: Separate production deploy path (`todo`)

- `todo` Select first production target
- `todo` Implement deploy action from project state to production target
- `todo` Persist deploy history/status in Supabase

Exit criteria:
- User can deploy outside sandbox and see deploy status/history

### M4: Hardening and API-surface extraction (`todo`)

- `todo` Tighten preview security/stability as needed
- `todo` Improve observability and failure handling
- `todo` Consolidate repeated gaps into candidate sandbox API surface in `SANDBOX.md`

Exit criteria:
- System is reliable for repeated demos and gap log is rich enough to derive abstraction candidates

---

## Immediate next tasks (execute now)

1. `done` Scaffold latest Next.js app with builder shell layout and placeholder data
2. `done` Add WorkOS AuthKit flow and route protection
3. `done` Set up Supabase schema migration v0
4. `done` Define minimal API contracts for agent/sandbox/trace/deploy
5. `done` Implement M0 stub backend endpoints and wire UI end-to-end
6. `done` Deploy M0 build to Vercel and configure production env/auth redirects
7. `done` Select E2B as first sandbox provider and define M1 harness architecture
8. `in_progress` Scaffold `harness/` app and wire first E2B session bootstrap
9. `in_progress` Maintain `SANDBOX.md` as real integration gaps appear

---

## Known issues / caveats

- Auth callback codes are single-use and short-lived; refreshing old callback URLs can return `invalid_grant`. Current callback handler restarts sign-in automatically for this case.
- `turbopack.root` is pinned to the `web/` directory in `web/next.config.ts` to avoid workspace-root drift and Tailwind module resolution failures when commands run from the repo root.
- For Vercel + Supabase Postgres, use a pooler host in `DATABASE_URL`; the direct `db.<project-ref>.supabase.co` host produced `ENOTFOUND` in runtime.
- For current `pg` behavior with Supabase pooler in this stack, `DATABASE_URL` uses `sslmode=no-verify`.

---

## Progress log

### 2026-02-20

- `done` Established repo-level direction in `AGENTS.md`
- `done` Created implementation tracker (`IMPLEMENTATION_PLAN.md`)
- `done` Created `SANDBOX.md` and linked it from planning/index docs
- `done` Adopted Progressive JPEG delivery approach and milestone plan
- `done` Bootstrapped `web/` with Next.js 16 App Router and M0 builder shell
- `done` Added protected auth, M0 API routes, timeline, and preview loop
- `done` Validated M0 locally with `npm run lint` and `npm run build`
- `done` Migrated auth to WorkOS AuthKit (`src/proxy.ts` middleware + `handleAuth` callback)
- `done` Removed custom app-managed auth cookies/state logic and kept app routes protected
- `done` Added callback error recovery for WorkOS `invalid_grant` (automatic fresh sign-in redirect)
- `done` Fixed Turbopack root configuration to resolve Tailwind/PostCSS reliably from `web/`
- `done` Renamed API routes from `/api/m0/*` to clean `/api/*` paths and updated all callsites/docs
- `done` Simplified builder header copy and removed stack-mode pills from UI
- `done` Added Supabase migration `supabase/migrations/20260220223500_m0_core_schema.sql` with indexes, triggers, and RLS baseline
- `done` Replaced in-memory-only session access paths with mandatory Supabase-backed store (`web/src/lib/builder/store.ts`)
- `done` Replaced Supabase API client usage with server-only Postgres pool (`web/src/lib/db/postgres.ts`) and removed `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` runtime dependency
- `done` Deployed production app to Vercel (`https://bolt-new-poc-web.vercel.app`) and configured WorkOS production callback/redirect settings
- `done` Fixed production DB connectivity by switching Vercel `DATABASE_URL` to Supabase pooler host and updating SSL mode for runtime compatibility
- `done` Chose E2B as M1 sandbox provider and locked first-pass harness design (`harness/` + per-message turn-runner + JSONL trace ingestion)

---

## Open questions

- Which Claude credential path should be used inside sandboxed harness runtime for M1 (API key vs other)?
- Which deploy target should be first for user-built apps (Cloudflare Workers, Vercel, other)?
- Should turn execution stay per-message command invocations in M1, or move to a long-lived harness daemon in M2?
