# bolt-new-poc

A Lovable/bolt.new-style AI app builder built on [OpenComputer](https://opencomputer.dev) APIs. Users describe an app in natural language, an AI agent builds it in a cloud sandbox, and they see a live preview — all in the browser.

This repo shows how little you need to build this kind of product on top of OpenComputer.

## Architecture

```
Browser (Next.js)            Platform API (Hono on Fly.io)         OpenComputer
     |                              |                                   |
     |  POST /v1/sessions           |                                   |
     |----------------------------->|  Sandbox.create()                 |
     |                              |---------------------------------->|
     |                              |  sandbox.agent.start(prompt)      |
     |                              |---------------------------------->|
     |                              |                                   |
     |  EventSource /events         |  WebSocket (agent events)         |
     |<-----------------------------|<----------------------------------|
     |                              |                                   |
     |  POST /v1/sessions/:id/msg   |  session.sendPrompt(message)      |
     |----------------------------->|---------------------------------->|
     |                              |                                   |
     |  iframe (preview)            |         sandbox port 3000         |
     |<------------------------------------------------------------- --|
```

**Three pieces:**

- **`web/`** — Next.js app. Handles auth (WorkOS), renders the builder UI, proxies to the platform API. Pure consumer — no sandbox or DB code.
- **`platform/`** — Hono API on Fly.io. Manages sessions, talks to OpenComputer SDK, streams agent events via SSE. Lives at `api.opencomputer.dev`.
- **`agent/`** — System prompt + skills. No code — just markdown files synced into the sandbox at session start.

## How It Works

### 1. Create a sandbox and start an agent

When a user submits a prompt, the platform creates an OpenComputer sandbox and starts a Claude agent inside it:

```typescript
import { Sandbox } from "@opencomputer/sdk";

const sandbox = await Sandbox.create({
  apiKey,
  template: "base",
  timeout: 3600,
  envs: { ANTHROPIC_API_KEY: "..." },
});

const agentSession = await sandbox.agent.start({
  prompt: "Build me a todo app with Next.js",
  systemPrompt: "You are a web app builder agent...",
  allowedTools: ["bash", "read", "write", "edit", "glob", "grep"],
  cwd: "/workspace/app",
  onEvent: (event) => {
    // persist to DB + push to SSE subscribers
  },
});
```

The agent has full terminal and filesystem access inside the sandbox. It scaffolds the project, installs deps, starts a dev server, and edits files — all autonomously.

### 2. Multi-turn chat

Follow-up messages reuse the same sandbox and agent session:

```typescript
const sandbox = await Sandbox.connect(sandboxId, { apiKey });
const session = await sandbox.agent.attach(agentSessionId, { onEvent });
session.sendPrompt("Add a dark mode toggle");
```

The agent sees the full conversation history and the current state of the project. No replay needed — `claude-agent-wrapper` (pre-installed in the sandbox) handles session continuity.

### 3. Stream events to the browser

Agent events (thinking, tool calls, file edits, errors) flow over WebSocket from the sandbox to the platform API, which persists them and pushes them to the browser via SSE:

```typescript
// Platform: SSE endpoint replays history then streams live
return streamSSE(c, async (stream) => {
  // Catch up: replay from DB
  const result = await pool.query(
    "SELECT metadata FROM session_events WHERE session_id = $1 ORDER BY created_at",
    [sessionId],
  );
  for (const row of result.rows) {
    await stream.writeSSE({ data: JSON.stringify(row.metadata) });
  }

  // Live: push new events as they arrive
  const unsubscribe = subscribe(sessionId, (event) => {
    stream.writeSSE({ data: JSON.stringify(event) });
  });
});
```

```typescript
// Browser: connect to SSE and update UI
const es = new EventSource(eventsUrl);
es.onmessage = (ev) => {
  const event = JSON.parse(ev.data);
  setLiveEvents((prev) => [...prev, event]);
};
```

### 4. Live preview

The agent starts a dev server (port 3000) inside the sandbox. OpenComputer exposes it as a public URL:

```typescript
const preview = await sandbox.createPreviewURL({ port: 3000 });
// → https://sb-xxx-p3000.preview.opencomputer.dev
```

This URL is embedded in an iframe in the builder UI. As the agent edits files, the dev server picks up changes via HMR and the preview updates in real-time.

### 5. The "agent" is just config

No agent code to write. The `agent/` directory contains:

- **`prompt.md`** — system prompt telling Claude it's a web app builder
- **`.claude/skills/build-app/SKILL.md`** — step-by-step workflow (scaffold, install, edit, verify)

These are synced into the sandbox and loaded into `claude-agent-wrapper` (pre-installed in OpenComputer's default template), which handles the Claude Agent SDK integration, tool execution, and multi-turn conversation.

## Running Locally

### Platform API

```bash
cd platform
cp .env.example .env  # fill in DATABASE_URL, ANTHROPIC_API_KEY, OPENCOMPUTER_API_URL
npm install
npm run dev            # → http://localhost:8081
```

### Web app

```bash
cd web
cp .env.example .env.local  # fill in WORKOS_*, PLATFORM_API_URL, OPENCOMPUTER_API_KEY
npm install
npm run dev                  # → http://127.0.0.1:3000
```

### What you need

- An [OpenComputer](https://opencomputer.dev) API key
- An [Anthropic](https://console.anthropic.com) API key (for Claude, passed into sandboxes)
- A [WorkOS](https://workos.com) account (for auth)
- A Postgres database (e.g. Supabase) — apply migrations from `supabase/migrations/`

## Production

- **Web app**: Vercel (`bolt-new-poc-web`)
- **Platform API**: Fly.io (`bolt-platform`) at `api.opencomputer.dev`
- **Database**: Supabase Postgres (shared)
