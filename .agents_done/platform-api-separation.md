# Platform API Separation Plan

## Status: DONE — 2026-03-18

Deployed to Fly.io as `bolt-platform` (Mohamed's org). Live at:
- `https://bolt-platform.fly.dev` (Fly default)
- `https://api.opencomputer.dev` (custom domain, A + AAAA + ACME challenge on Cloudflare)

---

## Goal

Extract sandbox orchestration, agent session management, and event streaming out of the Next.js app into a standalone **platform API** service. The Next.js app becomes a pure consumer — it handles auth (WorkOS) and UI, then proxies to the platform API for everything else.

**Long-term direction**: this platform API eventually merges into OpenComputer's API surface, making it "firebase for agent apps" — you build an agent, OpenComputer is your backend. For now, it's a standalone service deployed on Fly.io (or similar persistent runtime).

---

## Why

1. **Vercel can't hold WebSockets** — the web backend currently maintains a WebSocket per agent session for event streaming. Vercel serverless has 10-60s timeouts; the in-memory session map dies on cold start.
2. **Clean consumer pattern** — the Next.js app should only know about auth and UI. All sandbox/agent/session logic belongs behind an API boundary.
3. **Reusability** — the platform API can serve other frontends, CLI tools, or programmatic access without duplicating orchestration logic.
4. **Path to OpenComputer** — designing the API surface now as if it were a product API makes the eventual merge into OpenComputer smooth.

---

## What Moves Where

### Stays in Next.js (`web/`)
- WorkOS authentication (auth.ts, sign-in/sign-out routes)
- Builder UI (builder-shell.tsx)
- `/api/context` — returns auth user + config
- `/api/health`
- Proxy routes that forward to platform API

### Moves to Platform API (`platform/`)
- `lib/sandbox/opencomputer.ts` — sandbox lifecycle, agent sessions
- `lib/sandbox/event-bridge.ts` — event persistence + streaming
- `lib/db/postgres.ts` — session state DB
- `lib/builder/store.ts` — session orchestration
- `lib/builder/types.ts` — shared data contracts (published as types, consumed by both)

---

## Platform API Surface

Base URL: `http://localhost:8081` (local) / `https://bolt-platform.fly.dev` (production)

Auth: OpenComputer API key via `X-API-Key: osb_...` header (same key used for sandbox operations). No separate platform auth — the key validates itself when sandbox operations are attempted. The Next.js app authenticates users via WorkOS, then calls the platform API with the org's OpenComputer API key. User identity is passed in request body.

### Endpoints

#### Sessions

**`POST /v1/sessions`**
Create a new builder session. Provisions sandbox, starts agent, returns session handle.

```
Request:
{
  "prompt": "Build me a todo app with Next.js",
  "user_id": "user_abc123",
  "user_email": "user@example.com",
  "user_name": "Jane"
}

Response (201):
{
  "id": "session_abc123",
  "status": "running",
  "sandbox_id": "sb-xxx",
  "preview_url": "https://sb-xxx-3000.preview.opencomputer.dev",
  "project": {
    "title": "Build me a todo app",
    "framework": "nextjs"
  },
  "created_at": "2026-03-18T..."
}
```

**`GET /v1/sessions/:sessionId`**
Get full session state including messages, events, preview URL.

```
Query params: ?user_id=user_abc123 (ownership filter)

Response (200):
{
  "id": "session_abc123",
  "status": "ready",
  "sandbox_id": "sb-xxx",
  "preview_url": "https://...",
  "project": { "title": "...", "framework": "nextjs", "artifacts": [...] },
  "messages": [
    { "id": "msg_x", "role": "user", "content": "...", "created_at": "..." },
    { "id": "msg_y", "role": "assistant", "content": "...", "created_at": "..." }
  ],
  "events": [
    { "id": "evt_x", "type": "session_started", "level": "info", "message": "...", "created_at": "..." }
  ],
  "created_at": "...",
  "updated_at": "..."
}
```

**`POST /v1/sessions/:sessionId/messages`**
Send a user message to the agent. Returns immediately; agent work happens async, events stream via SSE.

```
Request:
{
  "message": "Add a dark mode toggle",
  "user_id": "user_abc123"
}

Response (200):
{
  "id": "session_abc123",
  "status": "running",
  ...
}
```

**`GET /v1/sessions/:sessionId/events`**
SSE stream of real-time agent events.

```
Query params: ?user_id=user_abc123

Response: text/event-stream
data: {"type":"assistant","message":{"content":[{"type":"text","text":"I'll add..."}]}}
data: {"type":"tool_use_summary","tool":"bash"}
data: {"type":"turn_complete"}
```

**`DELETE /v1/sessions/:sessionId`**
Kill the sandbox and mark session as ended.

```
Response (200): { "id": "session_abc123", "status": "ended" }
```

#### Future (not M1)

- `POST /v1/sessions/:sessionId/hibernate` — hibernate sandbox
- `POST /v1/sessions/:sessionId/wake` — wake sandbox
- `GET /v1/sessions` — list sessions for a user

---

## Platform API Internals

### Stack
- **Runtime**: Node.js + Express (or Hono — lightweight, similar to agents-control)
- **Database**: Same Supabase Postgres (shared with web app for now; same tables)
- **OpenComputer SDK**: `@opencomputer/sdk` for sandbox operations
- **Deployment**: Fly.io (persistent process, can hold WebSockets)

### Code reuse
The existing code in `web/src/lib/sandbox/` and `web/src/lib/builder/` moves almost as-is. The main changes:
- Remove `"server-only"` imports (not a Next.js module)
- Replace Next.js route handlers with Express/Hono handlers
- Replace WorkOS auth with OpenComputer API key validation middleware
- Accept `user_id` from request body/params instead of `getCurrentUser()`
- Pass the caller's API key through to OpenComputer SDK calls (no hardcoded key)

### Directory structure

```
platform/
  src/
    index.ts              # Server bootstrap, env validation
    routes/
      sessions.ts         # CRUD + messages + events endpoints
    lib/
      opencomputer.ts     # Sandbox lifecycle (from web/src/lib/sandbox/)
      event-bridge.ts     # Event persistence + SSE (from web/src/lib/sandbox/)
      store.ts            # Session orchestration (from web/src/lib/builder/)
      db.ts               # Postgres pool (from web/src/lib/db/)
      types.ts            # Shared types (from web/src/lib/builder/)
      auth.ts             # OpenComputer API key extraction middleware
  package.json
  tsconfig.json
  Dockerfile
  fly.toml
```

---

## Next.js App Changes

### New: Platform API client

```
web/src/lib/platform-client.ts
```

Thin HTTP client that calls the platform API. Passes `X-API-Key: osb_...` on every request.
- `createSession(prompt, user)` → `POST /v1/sessions`
- `getSession(sessionId, userId)` → `GET /v1/sessions/:id?user_id=...`
- `sendMessage(sessionId, message, userId)` → `POST /v1/sessions/:id/messages`
- `getEventsUrl(sessionId, userId)` → returns SSE URL with `?api_key=osb_...` for direct client connection

### Route changes

| Route | Before | After |
|-------|--------|-------|
| `POST /api/sessions` | Calls store.ts directly | Calls platform client |
| `GET /api/sessions/:id` | Calls store.ts directly | Calls platform client |
| `POST /api/sessions/:id/messages` | Calls store.ts directly | Calls platform client |
| `GET /api/sessions/:id/events` | Subscribes to event-bridge | Proxies SSE from platform API (or client connects directly) |

### SSE strategy

Two options for the events endpoint:

**Option A: Client connects to platform API directly**
- Builder UI EventSource points at `https://bolt-platform.fly.dev/v1/sessions/:id/events`
- Simpler, no proxy needed
- Requires CORS config on platform API
- Requires client-side auth token (or platform API allows public access per session)

**Option B: Next.js proxies SSE**
- Client EventSource still points at `/api/sessions/:id/events`
- Next.js route streams from platform API to client
- Works on Vercel if the upstream connection drives the response (streaming response, not held open by the server)
- More complex but keeps auth centralized

**Recommendation**: Start with Option A for simplicity. Client passes the OpenComputer API key as a query param (`?api_key=osb_...`) on the EventSource URL — same pattern OpenComputer uses for WebSocket auth.

---

## Removed from Next.js

After extraction, delete from `web/src/`:
- `lib/sandbox/` (entire directory)
- `lib/builder/store.ts` (orchestration logic)
- `lib/builder/types.ts` (move to shared package or platform)
- `lib/db/postgres.ts` (DB connection)

Keep in `web/src/`:
- `lib/auth/` (WorkOS)
- `lib/stack-modes.ts` (config)
- `lib/platform-client.ts` (new — HTTP client)
- `lib/builder/types.ts` (or import from shared)

---

## Environment Variables

### Platform API
```
PORT=8081
DATABASE_URL=postgresql://...          # Session state storage
OPENCOMPUTER_API_URL=https://app.opencomputer.dev
ANTHROPIC_API_KEY=sk-ant-...           # Passed into sandboxes for Claude
```

No `OPENCOMPUTER_API_KEY` in platform env — the caller passes it per-request via `X-API-Key` header and the platform forwards it to OpenComputer SDK calls.

### Next.js App (updated)
```
WORKOS_API_KEY=...                     # Auth (unchanged)
WORKOS_CLIENT_ID=...                   # Auth (unchanged)
WORKOS_COOKIE_PASSWORD=...             # Auth (unchanged)
PLATFORM_API_URL=http://localhost:8081 # Platform API base URL
OPENCOMPUTER_API_KEY=osb_...           # Passed to platform API on every request
```

Removed from web app: `DATABASE_URL`, `OPENCOMPUTER_API_URL`, `ANTHROPIC_API_KEY`

---

## Execution Plan

### Phase 1: Scaffold platform service — DONE
- [x] Create `platform/` directory with package.json, tsconfig, Dockerfile
- [x] Set up Hono with health check, CORS, error handling
- [x] Move DB, types, store, opencomputer, event-bridge code
- [x] OpenComputer API key passthrough auth (X-API-Key header)
- [x] Session routes: create, get, messages, events (SSE with DB replay), delete

### Phase 2: Convert Next.js to consumer — DONE
- [x] Create `platform-client.ts` in web/
- [x] Rewrite API routes to proxy through platform client
- [x] Remove pg, @opencomputer/sdk, store.ts, sandbox/, db/ from web
- [x] EventSource connects directly to platform API (Option A)

### Phase 3: Deploy — DONE
- [x] Deploy platform API to Fly.io (bolt-platform, Mohamed's org, Node 22, never sleeps)
- [x] Custom domain: api.opencomputer.dev (A + AAAA + ACME challenge on Cloudflare)
- [x] Fly secrets: DATABASE_URL, ANTHROPIC_API_KEY, OPENCOMPUTER_API_URL
- [x] Verified end-to-end: web on localhost -> platform on Fly -> OpenComputer sandbox

---

## Open Questions

1. **Shared DB or API-only?** — For now, platform API owns the DB and web app has no direct DB access. This is the clean path. If web app needs to read session data without going through platform API (e.g. for SSR), we can add read-only DB access later.

2. **ANTHROPIC_API_KEY ownership** — Currently the platform API holds it and injects it into sandboxes. Should this also be per-caller (passed via header like the OpenComputer key)? Probably yes long-term (each org brings their own Claude key), but for now a single key in the platform env is simpler.

3. **Shared types** — `types.ts` is used by both platform and web app. Options: (a) duplicate and keep in sync, (b) publish as a small npm package, (c) put in a shared workspace root. For now, duplicate — it's small.

4. **Should this just extend agents-api?** — agents-api already runs on Fly.io, manages sandbox operations, has DB + R2. Adding session-mode support there instead of creating a new service avoids a new deployment. Trade-off: agents-api is batch-oriented, adding interactive sessions is a larger change to an existing codebase. Starting fresh is faster and we can merge later.
