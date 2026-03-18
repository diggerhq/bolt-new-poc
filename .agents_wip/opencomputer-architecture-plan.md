# bolt-new-poc: OpenComputer + agents-api Architecture Plan

## Status: DRAFT — 2026-03-18

---

## Goal

Replace E2B with OpenComputer as the sandbox provider for the builder app. Align with the same agent deployment and execution patterns used by `base360-checkin-agent` and `agents-api`, while adapting for the builder's interactive, multi-turn, streaming requirements.

---

## Current State

- **bolt-new-poc/web**: M0 skeleton with stubbed agent/sandbox. Sessions, messages, events in Supabase. WorkOS auth. Deployed on Vercel.
- **agents-api**: Batch execution platform. One sandbox per execution, deleted on completion. No streaming, no persistent sessions. Manages agent versions/artifacts via R2.
- **base360-checkin-agent**: Reference agent. Claude Agent SDK, deployed as agents-api version. Single-turn batch: read input JSON -> run agent -> write result JSON.
- **OpenComputer SDK**: Full sandbox platform. Native `sandbox.agent.start()` API with WebSocket streaming events, multi-turn `sendPrompt()`, persistent sandboxes, checkpoints, preview URLs.

---

## Key Tension

agents-api is **batch-oriented**: create execution -> spin sandbox -> run to completion -> collect result -> delete sandbox.

The builder needs **interactive sessions**: persistent sandbox across many chat turns, streaming events per turn, live preview URL, multi-turn conversation context.

---

## Architecture Decision

### Two-layer approach: agents-api for packaging/deployment, OpenComputer SDK for runtime

| Concern | Owner | Rationale |
|---------|-------|-----------|
| Agent code (prompts, skills, tools) | `agent/` directory in bolt-new-poc | Same pattern as checkin-agent |
| Agent packaging & versioning | agents-api | Immutable versions, R2 artifact storage, deploy pipeline |
| Sandbox lifecycle (create, persist, kill) | Web backend via OpenComputer TS SDK | Need persistent sandbox across turns |
| Agent execution (multi-turn, streaming) | Web backend via OpenComputer Agent API | `sandbox.agent.start()` + `sendPrompt()` with event streaming |
| Preview URL | OpenComputer sandbox port exposure | Dev server runs in sandbox, port exposed as preview URL |
| Batch/API execution (future) | agents-api | Same agent artifact, batch mode, for headless/CI use |

**Why not agents-api for runtime?** Its execution model (one sandbox per execution, no streaming, teardown on completion) doesn't fit interactive builder sessions. Extending agents-api for sessions is possible but is a bigger change that should come later, informed by what we learn building this.

**Why still use agents-api?** It already handles the deployment pipeline (build, package, upload to R2, create version, manage env vars). We want the builder agent to be a first-class agents-api agent that _also_ supports interactive mode.

---

## Component Overview

```
bolt-new-poc/
  agent/                    # Builder agent code (NEW)
    src/
      main.ts               # Batch entry point (agents-api compat)
      prompt.ts              # System prompt builder
      tools.ts               # Tool definitions/config
      contracts/
        session.ts           # Input/output schemas
    .claude/
      skills/
        build-app/SKILL.md   # Builder workflow skill
    package.json
    tsconfig.json

  web/                       # Next.js app (EXISTING, modified)
    src/
      lib/
        sandbox/
          opencomputer.ts    # OpenComputer SDK adapter
          session-manager.ts # Sandbox lifecycle per builder session
          event-bridge.ts    # Stream sandbox events -> Supabase + SSE
        builder/
          store.ts           # (existing) DB operations
          orchestrator.ts    # Session bootstrap + turn execution
      app/
        api/
          sessions/
            route.ts         # (existing, modified) Create session -> bootstrap sandbox
            [sessionId]/
              messages/
                route.ts     # (existing, modified) Send message -> trigger turn
              events/
                route.ts     # (NEW) SSE endpoint for streaming events

  scripts/
    deploy-builder-agent.mjs # Package + deploy agent to agents-api (NEW)

  supabase/
    migrations/
      ...existing...
      NNNN_sandbox_state.sql # Add sandbox bookkeeping columns (NEW)
```

---

## The Agent (`agent/`)

### Shape

Mirrors `base360-checkin-agent/agent/` pattern:

- **Claude Agent SDK** with `query()` or via `claude-agent-wrapper` (configurable)
- **System prompt** tailored for web app building: file editing, terminal, dev server management
- **Tools**: `Bash` (run commands, install deps, start servers), `Read`/`Write` (file ops), `Skill` (build-app workflow)
- **Skill**: `.claude/skills/build-app/SKILL.md` — codifies the builder workflow (scaffold -> install -> edit -> restart -> verify)

### Dual execution modes

1. **Interactive mode** (via OpenComputer `sandbox.agent.start()`):
   - Used by the web UI
   - `claude-agent-wrapper` runs in sandbox, configured with builder system prompt + tools
   - Multi-turn: `sendPrompt(text)` for each user message
   - Streaming events flow over WebSocket

2. **Batch mode** (via agents-api execution):
   - Used for headless/API/CI scenarios
   - `node dist/main.ts --input ... --output ...` (same as checkin-agent)
   - Single prompt in, structured result out
   - Future concern — wire up when needed

### Key design: the agent code lives in `agent/` but the _runtime_ differs

In interactive mode, the agent's system prompt, skills, and tool config are loaded into `claude-agent-wrapper` inside the sandbox. The `agent/` directory is synced into the sandbox at `/workspace/agent/` so skills files are accessible.

In batch mode, `main.ts` runs directly (like checkin-agent).

---

## Sandbox Lifecycle (Web Backend)

### Session Bootstrap (on POST /api/sessions)

```
1. Create OpenComputer sandbox
   - template: "default" (has Node.js, claude-agent-wrapper pre-installed)
   - or: custom snapshot with project scaffolding pre-baked
   - timeout: 3600s (1 hour idle)
   - envs: { ANTHROPIC_API_KEY, ... }

2. Sync agent code into sandbox
   - Upload agent/ contents to /workspace/agent/
   - (Or: download versioned artifact from R2 if using agents-api packaging)

3. Scaffold user project
   - Create /workspace/app/ with starter template (Next.js, etc.)
   - npm install in /workspace/app/

4. Start dev server
   - sandbox.exec.start("npm run dev", { cwd: "/workspace/app" })
   - Capture the port (typically 3000)

5. Get preview URL
   - Use OpenComputer preview URL for the dev server port
   - Persist to builder_sessions.preview_url

6. Start agent session
   - sandbox.agent.start({
       prompt: <user's initial prompt>,
       model: "claude-sonnet-4-20250514",
       systemPrompt: <loaded from agent/src/prompt.ts>,
       allowedTools: ["bash", "read", "write", "skill"],
       cwd: "/workspace/app",
       onEvent: (event) => bridge to SSE + persist to session_events
     })

7. Persist sandbox state
   - Store sandbox_id, agent_session_id in builder_sessions
```

### Turn Execution (on POST /api/sessions/:id/messages)

```
1. Look up active sandbox + agent session for this builder session
2. If sandbox is hibernated -> wake it
3. session.sendPrompt(userMessage)
4. Events stream via onEvent callback -> SSE to client + persist to session_events
5. On turn_complete event -> update session status to "ready"
```

### Sandbox Persistence

- Sandbox stays alive across turns (idle timeout: 1 hour)
- On idle timeout: OpenComputer hibernates the sandbox automatically
- On user return: wake sandbox, reattach to agent session (or start new one)
- On explicit "end session": kill sandbox
- **Checkpoints**: consider periodic checkpointing for crash recovery (not M1, maybe M2)

---

## Event Streaming

### Flow

```
claude-agent-wrapper (in sandbox)
  -> WebSocket (JSON-line events)
    -> OpenComputer SDK onEvent callback (in web backend)
      -> Two outputs:
         1. Persist to session_events table (Supabase)
         2. Push to SSE endpoint (GET /api/sessions/:id/events)
            -> Browser EventSource -> trace timeline UI
```

### Event Types (from claude-agent-wrapper)

| Event | Maps to UI |
|-------|------------|
| `ready` | Agent initialized |
| `configured` | Agent configured with tools/prompt |
| `assistant` | Agent thinking/responding (show in chat) |
| `tool_use_summary` | File edit, command run, etc. (show in trace timeline) |
| `turn_complete` | Turn finished (unlock input) |
| `result` | Final result for the turn |
| `error` | Error occurred (show in timeline) |

### SSE Endpoint

`GET /api/sessions/:id/events`
- Returns `text/event-stream`
- Server keeps connection open
- Pushes events as they arrive from sandbox
- Client reconnects with `Last-Event-ID` for catch-up (read from session_events)

---

## Preview URL

- Dev server (e.g. Next.js/Vite) runs inside sandbox on a port
- OpenComputer exposes it via `sandbox.connectURL` + port routing (or dedicated preview URL API)
- Stored in `builder_sessions.preview_url`
- Embedded in iframe in builder UI
- Survives across turns (same sandbox, same process)
- On sandbox wake: dev server may need restart -> agent handles this

---

## What agents-api Needs (Changes)

### No changes required for M1

For the interactive builder flow, the web backend talks to OpenComputer directly. agents-api is used only for the deployment pipeline (packaging + versioning the agent artifact).

### Future considerations (post-M1)

These are things we _might_ want to add to agents-api after learning from the builder:

1. **Session-mode executions**: Long-lived sandbox, multiple turns per execution, streaming events. This would let agents-api itself serve the interactive use case, removing the need for web backend to use OpenComputer SDK directly.

2. **Preview URL management**: Track and expose sandbox preview URLs as part of execution state.

3. **Sandbox persistence**: Don't auto-delete sandbox on completion. Support "continue" on existing execution.

4. **Event streaming**: SSE/WebSocket endpoint on agents-api for real-time execution events.

Log these as gaps in `SANDBOX.md` as we build.

---

## Database Changes

Add to `builder_sessions`:

```sql
ALTER TABLE builder_sessions
  ADD COLUMN sandbox_id TEXT,
  ADD COLUMN sandbox_agent_session_id TEXT,
  ADD COLUMN sandbox_status TEXT DEFAULT 'none',  -- none|creating|running|hibernated|dead
  ADD COLUMN sandbox_created_at TIMESTAMPTZ,
  ADD COLUMN sandbox_last_active_at TIMESTAMPTZ;
```

---

## Deploy Pipeline (`scripts/deploy-builder-agent.mjs`)

Same pattern as `agents-api/scripts/deploy-checkin-agent.mjs`:

1. `cd agent/ && npm run build`
2. `tar` the build output + skills + CLAUDE.md
3. Upload tarball to R2 via presigned URL
4. Create/update agents-api version:
   - agent ID: `bolt-builder`
   - runtime.command: `["node", "dist/main.js", "--input", "$AGENT_INPUT_PATH", "--output", "$AGENT_RESULT_PATH"]`
   - env_requirements: `["ANTHROPIC_API_KEY"]`
5. Set env vars via agents-api

This gives us the batch execution path for free via agents-api, even though the web UI uses OpenComputer directly for interactive mode.

---

## Execution Plan (Build Order)

### Phase 1: Agent scaffold

- [ ] Create `agent/` directory with package.json, tsconfig, src/
- [ ] Write system prompt for builder agent (prompt.ts)
- [ ] Write build-app skill (.claude/skills/build-app/SKILL.md)
- [ ] Write batch entry point (main.ts) matching agents-api contract
- [ ] Test locally: run agent against a local directory

### Phase 2: OpenComputer integration in web backend

- [ ] Add `opencomputer` SDK dependency to web/
- [ ] Create `lib/sandbox/opencomputer.ts` — thin wrapper around SDK
- [ ] Create `lib/sandbox/session-manager.ts` — sandbox lifecycle (create, wake, kill, lookup)
- [ ] Add sandbox columns to builder_sessions (migration)
- [ ] Wire POST /api/sessions to create sandbox + start agent
- [ ] Wire POST /api/sessions/:id/messages to sendPrompt on existing session

### Phase 3: Event streaming

- [ ] Create `lib/sandbox/event-bridge.ts` — translate agent events to session_events + SSE
- [ ] Add GET /api/sessions/:id/events SSE endpoint
- [ ] Update builder UI to consume SSE for real-time trace timeline
- [ ] Update builder UI chat to show streaming assistant messages

### Phase 4: Preview

- [ ] Wire dev server startup in sandbox bootstrap
- [ ] Persist preview URL from sandbox to builder_sessions
- [ ] Update builder UI iframe to load real preview URL
- [ ] Handle dev server restart on sandbox wake

### Phase 5: Deploy pipeline + polish

- [ ] Write `scripts/deploy-builder-agent.mjs`
- [ ] Deploy agent to agents-api as `bolt-builder`
- [ ] Add sandbox hibernation/wake handling
- [ ] Add error recovery (sandbox died, agent crashed)
- [ ] Add timeout handling for turns

---

## Environment Variables (New)

Web backend needs:
```
OPENCOMPUTER_API_KEY=...     # From opencomputer account
OPENCOMPUTER_API_URL=...     # e.g. https://app.opencomputer.dev/api
ANTHROPIC_API_KEY=...        # Passed into sandbox for agent
```

The `OPENCOMPUTER_*` values can be copied from `agents-api/.env`.

---

## Open Questions

1. **Snapshot vs template**: Should we create a custom OpenComputer snapshot with Node.js project scaffold pre-installed (faster bootstrap) or scaffold fresh each time?

2. **Agent session reconnection**: When the web backend restarts (Vercel cold start), can we reattach to an existing agent session in a running sandbox? OpenComputer's `sandbox.agent.attach(sessionId)` suggests yes.

3. **Conversation context**: Does `claude-agent-wrapper` maintain conversation history across `sendPrompt()` calls within the same session? If so, no need to replay history. Need to verify.

4. **Cost model**: Sandbox idle timeout vs hibernation. What's the cost profile? Should we aggressively hibernate idle sandboxes?

5. **Agent artifact sync**: Pull versioned artifact from R2 at sandbox bootstrap (consistent with agents-api versioning) or sync from local disk (simpler for dev)?

6. **Vercel + WebSocket**: SSE works on Vercel, but the OpenComputer SDK uses WebSocket to receive events. The web backend (on Vercel) needs to maintain a WebSocket connection to the sandbox. Vercel serverless functions have 10s/60s timeouts — this may require a persistent backend (Fly.io, Railway) or a different streaming architecture. **This is a critical constraint to resolve early.**

7. **Should agents-api grow session support?**: If yes, the web backend could delegate everything to agents-api (including sandbox lifecycle) and just consume an SSE stream from agents-api. Cleaner separation but bigger agents-api change.
