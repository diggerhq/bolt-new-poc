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

## Architecture sketch (working draft)

- Frontend app-builder UI
- Backend agent orchestration service
- Sandbox provider integration (execution/filesystem/preview)
- Event + trace store for timeline
- Deploy adapter (production target, separate from sandbox)

---

## Workstreams

### 1) UX and frontend shell

- `todo` Define IA for prompt/chat/preview/timeline layout
- `todo` Build first-pass UI shell with placeholder data
- `todo` Wire real-time timeline updates

### 2) Agent runtime and task loop

- `todo` Define agent action model (plan, edit, run, inspect, retry)
- `todo` Implement prompt -> project bootstrap flow
- `todo` Implement iterative chat edit loop

### 3) Sandbox integration

- `todo` Choose first provider and document rationale in `DECISIONS.md`
- `todo` Implement session lifecycle (create/resume/terminate)
- `todo` Implement command execution + file sync primitives
- `todo` Implement preview URL surfacing

### 4) Debug loop

- `todo` Capture run logs/errors in trace model
- `todo` Add "fix this" loop from runtime failures
- `todo` Add retry + rollback behavior

### 5) Deploy pipeline

- `todo` Select first production target (separate from sandbox)
- `todo` Implement deploy action and status reporting
- `todo` Persist deploy history and artifacts

### 6) Learnings capture

- `in_progress` Maintain `SANDBOX.md`
- `todo` Create and maintain `DECISIONS.md`
- `todo` Add gap entries whenever provider glue code is introduced

---

## Immediate next tasks

1. `todo` Create `DECISIONS.md` and select initial sandbox provider
2. `done` Create `SANDBOX.md` with template entries
3. `todo` Define MVP trace event schema
4. `todo` Scaffold backend service boundaries (agent, sandbox, trace, deploy)
5. `todo` Scaffold frontend builder layout (chat + preview + timeline)

---

## Progress log

### 2026-02-20

- `done` Established repo-level direction in `AGENTS.md`
- `done` Created implementation tracker (`IMPLEMENTATION_PLAN.md`)
- `done` Created `SANDBOX.md` and linked it from planning/index docs

---

## Open questions

- Which sandbox provider should be first (E2B, Daytona, Modal, other)?
- Which deploy target should be first (Cloudflare Workers, Vercel, other)?
- What is the minimum trace schema that still supports a useful timeline/debug loop?
