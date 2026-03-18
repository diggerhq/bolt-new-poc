# bolt-new-poc

A Lovable/bolt.new-style AI app builder built on [OpenComputer](https://opencomputer.dev). Users describe an app, an AI agent builds it in a cloud sandbox, and they see a live preview — all in the browser.

The entire app is a Next.js frontend that calls four OpenComputer API endpoints. No agent code, no sandbox orchestration, no infrastructure to manage.

## What the app does

1. User signs in (WorkOS) and types "Build me a todo app"
2. App calls OpenComputer to create a builder session
3. An AI agent scaffolds the project, installs deps, starts a dev server — all inside a cloud sandbox
4. User sees real-time agent activity (file edits, terminal commands) and a live preview
5. User sends follow-up messages to iterate ("Add dark mode") — same session, same sandbox

## Integration with OpenComputer

The app uses four API calls. That's the entire backend integration.

### Create a session

User submits a prompt. The app creates a builder session — OpenComputer provisions a sandbox, starts an AI agent, and returns a session with a live preview URL.

```typescript
// POST /v1/sessions
const resp = await fetch("https://api.opencomputer.dev/v1/sessions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": OPENCOMPUTER_API_KEY,
  },
  body: JSON.stringify({
    prompt: "Build me a todo app with Next.js",
    user_id: user.id,
    user_email: user.email,
    user_name: user.name,
  }),
});

const session = await resp.json();
// session.id         → "session_abc123"
// session.status     → "running"
// session.previewUrl → "https://sb-xxx-p3000.preview.opencomputer.dev"
```

### Stream agent events

Connect an EventSource to get real-time updates as the agent works — file edits, terminal commands, thinking, errors, turn completion.

```typescript
const es = new EventSource(
  `https://api.opencomputer.dev/v1/sessions/${session.id}/events?api_key=${OPENCOMPUTER_API_KEY}`
);

es.onmessage = (ev) => {
  const event = JSON.parse(ev.data);
  // event.type → "assistant" | "tool_use_summary" | "turn_complete" | "error" | ...
  // event.message.content → [{type: "text", text: "I'll create..."}, {type: "tool_use", name: "bash", ...}]
};
```

### Send a follow-up message

User asks for changes. Same session, same sandbox — the agent sees the full conversation and current project state.

```typescript
await fetch(`https://api.opencomputer.dev/v1/sessions/${session.id}/messages`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": OPENCOMPUTER_API_KEY,
  },
  body: JSON.stringify({
    message: "Add a dark mode toggle",
    user_id: user.id,
  }),
});
// Agent starts working → events stream via the existing EventSource
```

### Show the preview

The agent starts a dev server inside the sandbox. OpenComputer exposes it as a public URL. Embed it in an iframe — it updates in real-time as the agent edits files.

```html
<iframe src={session.previewUrl} />
```

## Project structure

```
web/                          # Next.js app (this is what you'd build)
  src/
    lib/
      platform-client.ts     # 4 API calls to OpenComputer (67 lines)
      auth/auth.ts            # WorkOS authentication
    app/
      builder/
        builder-shell.tsx     # Chat + trace timeline + preview iframe
      api/sessions/           # Thin proxy: auth user, call OpenComputer

agent/                        # Agent config (synced into sandbox by OpenComputer)
  prompt.md                   # System prompt: "You are a web app builder..."
  .claude/skills/
    build-app/SKILL.md        # Workflow: scaffold → install → edit → verify
```

The `agent/` directory is just markdown — a system prompt and a skill definition. No code. OpenComputer loads these into `claude-agent-wrapper` (pre-installed in the sandbox) which handles the Claude Agent SDK, tool execution, and multi-turn conversation.

## Running locally

```bash
cd web
npm install
cp .env.example .env.local    # fill in values below
npm run dev                   # → http://127.0.0.1:3000
```

### Environment variables

```env
# Auth (WorkOS)
WORKOS_API_KEY=sk_...
WORKOS_CLIENT_ID=client_...
WORKOS_COOKIE_PASSWORD=<32+ char random string>
NEXT_PUBLIC_WORKOS_REDIRECT_URI=http://127.0.0.1:3000/auth/callback

# OpenComputer
PLATFORM_API_URL=https://api.opencomputer.dev
OPENCOMPUTER_API_KEY=osb_...
```

You also need to apply the database migrations in `supabase/migrations/` to a Postgres database — but that's for session/message persistence on the app side, not for the OpenComputer integration.

## What OpenComputer handles

Everything below the four API calls:

- Sandbox provisioning (Firecracker VMs)
- AI agent execution (Claude Agent SDK via `claude-agent-wrapper`)
- Multi-turn conversation context
- Tool execution (bash, file read/write/edit, glob, grep)
- Dev server exposure as preview URLs
- Agent event streaming (WebSocket from sandbox → SSE to your app)
- Session persistence across turns
