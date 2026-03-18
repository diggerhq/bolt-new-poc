# bolt-new-poc: OpenComputer + agents-api Architecture Plan

## Status: IN PROGRESS — 2026-03-18

---

## Goal

Replace E2B with OpenComputer as the sandbox provider for the builder app. Interactive-only: no batch mode, no agents-api deployment pipeline. The web backend uses the OpenComputer SDK directly to manage sandboxes and run the agent via `claude-agent-wrapper`.

---

## Current State

- **bolt-new-poc/web**: OpenComputer sandbox integration wired. Sessions bootstrap real sandboxes, agent runs via `claude-agent-wrapper`, events stream via SSE to UI.
- **bolt-new-poc/agent/**: System prompt + build-app skill. No code — config only, synced into sandbox.
- **agents-api**: Not in the runtime path. Batch execution platform used by other agents. May grow session support later.
- **OpenComputer SDK**: `@opencomputer/sdk` v0.5.12 installed in web/. Used for sandbox lifecycle, agent sessions, preview URLs.

---

## Key Tension

agents-api is **batch-oriented**: create execution -> spin sandbox -> run to completion -> collect result -> delete sandbox.

The builder needs **interactive sessions**: persistent sandbox across many chat turns, streaming events per turn, live preview URL, multi-turn conversation context.

---

## Architecture Decision

### Web backend talks to OpenComputer directly

| Concern | Owner | Rationale |
|---------|-------|-----------|
| Agent config (prompt, skills, tools) | `agent/` directory in bolt-new-poc | Config files synced into sandbox |
| Sandbox lifecycle (create, persist, kill) | Web backend via OpenComputer TS SDK | Need persistent sandbox across turns |
| Agent execution (multi-turn, streaming) | Web backend via OpenComputer Agent API | `sandbox.agent.start()` + `sendPrompt()` with event streaming |
| Preview URL | OpenComputer sandbox port exposure | Dev server runs in sandbox, port exposed as preview URL |

**Why not agents-api?** Its execution model (one sandbox per execution, no streaming, teardown on completion) doesn't fit interactive builder sessions. agents-api may grow session support later, informed by what we learn here.

---

## Component Overview

```
bolt-new-poc/
  agent/                    # Builder agent config — synced into sandbox
    prompt.md               # System prompt for the builder agent
    .claude/
      skills/
        build-app/SKILL.md  # Builder workflow skill

  web/                       # Next.js app
    src/
      lib/
        sandbox/
          opencomputer.ts    # Sandbox bootstrap, agent session management, preview URL
          event-bridge.ts    # Persist agent events to DB + push to SSE subscribers
        builder/
          store.ts           # DB operations, wired to sandbox orchestration
      app/
        api/
          sessions/
            route.ts         # Create session -> bootstrap sandbox
            [sessionId]/
              messages/
                route.ts     # Send message -> sendPrompt on agent session
              events/
                route.ts     # SSE endpoint for real-time event streaming
        builder/
          builder-shell.tsx  # UI with EventSource for live trace timeline

  supabase/
    migrations/
      20260220223500_m0_core_schema.sql
      20260318000000_sandbox_state.sql   # sandbox_id, agent_session_id, sandbox_status columns
```

---

## The Agent (`agent/`)

### Shape

No code — just config files synced into the sandbox:

- **`prompt.md`**: System prompt tailored for web app building (file editing, terminal, dev server management)
- **`.claude/skills/build-app/SKILL.md`**: Codifies the builder workflow (scaffold -> install -> edit -> restart -> verify)

These are loaded into `claude-agent-wrapper` (pre-installed in the OpenComputer default template) at session start via `sandbox.agent.start({ systemPrompt, ... })`.

### Runtime

`claude-agent-wrapper` handles everything: multi-turn conversation, tool execution, streaming events. We configure it with:
- System prompt (from `agent/prompt.md`)
- Allowed tools: `bash`, `read`, `write`, `skill`
- Working directory: `/workspace/app`
- Skills directory synced to `/workspace/agent/.claude/skills/`

---

## Sandbox Lifecycle (Web Backend)

### Session Bootstrap (on POST /api/sessions)

```
1. Create OpenComputer sandbox
   - template: "default" (has Node.js, claude-agent-wrapper pre-installed)
   - or: custom snapshot with project scaffolding pre-baked
   - timeout: 3600s (1 hour idle)
   - envs: { ANTHROPIC_API_KEY, ... }

2. Sync agent config into sandbox
   - Upload agent/ contents to /workspace/agent/

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

The builder talks to OpenComputer directly. agents-api is not in the runtime path.

### Future considerations (post-M1)

If agents-api grows session support (persistent sandboxes, streaming events, multi-turn), the web backend could delegate sandbox lifecycle to agents-api instead. Log gaps in `SANDBOX.md` as we build.

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

## Execution Plan (Build Order)

### Phase 1: Agent config — DONE

- [x] Create `agent/` directory
- [x] Write system prompt (`agent/prompt.md`)
- [x] Write build-app skill (`agent/.claude/skills/build-app/SKILL.md`)

### Phase 2: OpenComputer integration in web backend — DONE

- [x] Add `@opencomputer/sdk` dependency to web/
- [x] Create `lib/sandbox/opencomputer.ts` — sandbox bootstrap, agent session management, preview URL
- [x] Create `lib/sandbox/event-bridge.ts` — persist events to DB + in-memory SSE pub/sub
- [x] Add sandbox columns to builder_sessions (migration applied)
- [x] Wire POST /api/sessions to create sandbox + start agent
- [x] Wire POST /api/sessions/:id/messages to sendPrompt on existing session
- [x] Keep agent sessions alive in memory (Map) so WebSocket stays open
- [x] Reattach to existing sandbox session on server restart

### Phase 3: Event streaming — DONE

- [x] Add GET /api/sessions/:id/events SSE endpoint
- [x] Update builder UI to consume SSE via EventSource for real-time trace timeline
- [ ] Update builder UI chat to show streaming assistant messages (assistant events have content but not yet parsed into chat messages)

### Phase 4: Preview — PARTIAL

- [x] Create preview URL via `sandbox.createPreviewURL({ port: 3000 })` at bootstrap
- [x] Persist preview URL to builder_sessions
- [x] Builder UI iframe loads real sandbox preview URL
- [ ] Handle dev server restart on sandbox wake

### Phase 5: Polish

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

2. ~~**Agent session reconnection**~~: RESOLVED — `sandbox.agent.attach(sessionId)` works. Implemented in `sendMessage()` as fallback when in-memory session is lost.

3. **Conversation context**: Does `claude-agent-wrapper` maintain conversation history across `sendPrompt()` calls within the same session? Wrapper tracks `claudeSessionId` and passes `resume` on subsequent calls, so yes — but needs testing.

4. **Cost model**: Sandbox idle timeout vs hibernation. What's the cost profile? Should we aggressively hibernate idle sandboxes?

5. **Vercel + WebSocket**: SSE works on Vercel, but the backend holds a WebSocket to the sandbox for events. Vercel serverless has 10s/60s timeouts — in-memory session map won't survive. **For local dev this works. For production, need a persistent backend (Fly.io) or push event ingestion to a separate service.**

6. **Should agents-api grow session support?**: If yes, the web backend could delegate everything to agents-api (including sandbox lifecycle) and just consume an SSE stream from agents-api. Cleaner separation but bigger agents-api change.
