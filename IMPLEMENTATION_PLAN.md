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
- WorkOS auth for user/session identity
- Supabase for app data (projects, chats, traces, deploy records)
- Sandbox provider adapter (single provider first)
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
- Database: Supabase (Postgres + auth/session metadata storage)
- Authentication: WorkOS
- Sandbox: one provider to start (`todo` choose)
- Deploy target: separate from sandbox (`todo` choose)

---

## Assumptions and caveats

- Assumption: backend complexity can stay low because sandbox handles compute/exec/filesystem/ports.
- Clarification: mostly true for execution primitives, but backend still owns orchestration, authz, state, trace persistence, retries/timeouts, and deploy coordination.
- Assumption: user-built app can be served from sandbox for development.
- Decision: yes for the first approximation; start with provider URL/port exposure in dev, and record any need for stable/public/policy-gated URLs in `SANDBOX.md`.

---

## Progressive milestones

### M0: End-to-end skeleton with stubs (`in_progress`)

Goal: all major components exist and work together in one flow.

- `todo` Next.js builder UI shell (prompt/chat/preview/timeline panes)
- `todo` WorkOS sign-in + protected builder route
- `todo` Supabase schema v0 (users, projects, conversations, traces, sessions)
- `todo` API endpoints with stubbed agent/sandbox/deploy behavior
- `todo` Trigger prompt -> "fake generated app" -> preview panel wired
- `todo` Deploy first approximation to a hosted environment

Exit criteria:
- User can sign in, create a project, submit prompt, see timeline events, and open a preview URL (stubbed output acceptable)

### M1: Real sandbox execution loop (`todo`)

- `todo` Select provider and implement session lifecycle
- `todo` Replace stub run/edit actions with real command/file operations
- `todo` Stream real execution logs into trace timeline
- `todo` Keep dev preview backed by sandbox URL

Exit criteria:
- Prompt generates/edits files in a real sandbox and serves a real running preview

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

1. `todo` Scaffold latest Next.js app with builder shell layout and placeholder data
2. `todo` Add WorkOS auth flow and route protection
3. `todo` Set up Supabase project + schema migration v0
4. `todo` Define minimal API contracts for agent/sandbox/trace/deploy
5. `todo` Implement M0 stub backend endpoints and wire UI end-to-end
6. `todo` Deploy M0 build and validate full flow with stubs
7. `in_progress` Maintain `SANDBOX.md` as real integration gaps appear

---

## Progress log

### 2026-02-20

- `done` Established repo-level direction in `AGENTS.md`
- `done` Created implementation tracker (`IMPLEMENTATION_PLAN.md`)
- `done` Created `SANDBOX.md` and linked it from planning/index docs
- `done` Adopted Progressive JPEG delivery approach and milestone plan

---

## Open questions

- Which sandbox provider should be first (E2B, Daytona, Modal, other)?
- Which deploy target should be first (Cloudflare Workers, Vercel, other)?
- Should we keep orchestration in-process for M0/M1, or add a queue before M2?
