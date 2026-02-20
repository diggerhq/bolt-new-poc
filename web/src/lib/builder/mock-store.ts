import type {
  AppendMessageInput,
  BuilderSession,
  CreateSessionInput,
  TraceEvent,
} from "@/lib/builder/types";

const sessions = new Map<string, BuilderSession>();

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizePrompt(prompt: string): string {
  const trimmed = prompt.trim();
  return trimmed.length > 0 ? trimmed : "Build a starter app";
}

function toTitle(prompt: string): string {
  const compact = sanitizePrompt(prompt)
    .replace(/[^\w\s-]/g, "")
    .split(/\s+/)
    .slice(0, 6)
    .join(" ");

  if (compact.length === 0) {
    return "Generated App";
  }

  return compact[0]?.toUpperCase() + compact.slice(1);
}

function baseEvents(prompt: string): TraceEvent[] {
  const createdAt = nowIso();
  return [
    {
      id: createId("evt"),
      type: "session_started",
      level: "info",
      message: "Session created and orchestration started.",
      createdAt,
    },
    {
      id: createId("evt"),
      type: "planning",
      level: "info",
      message: `Agent planned a first pass from prompt: "${prompt}".`,
      createdAt,
    },
    {
      id: createId("evt"),
      type: "files_generated",
      level: "info",
      message: "Stub project files were generated in memory.",
      createdAt,
    },
    {
      id: createId("evt"),
      type: "dev_server_started",
      level: "info",
      message: "Stub dev server booted and exposed a preview route.",
      createdAt,
    },
    {
      id: createId("evt"),
      type: "preview_ready",
      level: "info",
      message: "Preview is ready.",
      createdAt,
    },
  ];
}

function buildAssistantReply(message: string): string {
  return [
    "Applied stub update:",
    `- Interpreted request: "${message}"`,
    "- Updated plan and simulated code edits in the sandbox adapter.",
    "- Refreshed preview build for the current session.",
  ].join("\n");
}

export function createSession(input: CreateSessionInput): BuilderSession {
  const prompt = sanitizePrompt(input.prompt);
  const createdAt = nowIso();
  const sessionId = createId("session");
  const title = toTitle(prompt);

  const session: BuilderSession = {
    id: sessionId,
    userId: input.userId,
    previewUrl: `/preview/${sessionId}`,
    createdAt,
    updatedAt: createdAt,
    status: "ready",
    project: {
      title,
      framework: "nextjs",
      artifacts: [
        {
          path: "app/page.tsx",
          summary: "Landing page with builder shell.",
        },
        {
          path: "app/api/m0/sessions/route.ts",
          summary: "Stub create-session endpoint.",
        },
      ],
    },
    messages: [
      {
        id: createId("msg"),
        role: "user",
        content: prompt,
        createdAt,
      },
      {
        id: createId("msg"),
        role: "assistant",
        content:
          "Session initialized. I generated a first-pass scaffold and started preview.",
        createdAt,
      },
    ],
    events: baseEvents(prompt),
  };

  sessions.set(session.id, session);
  return session;
}

export function getSession(sessionId: string): BuilderSession | null {
  const session = sessions.get(sessionId);
  return session ?? null;
}

export function appendSessionMessage(
  input: AppendMessageInput,
): BuilderSession | null {
  const session = sessions.get(input.sessionId);

  if (!session) {
    return null;
  }

  const createdAt = nowIso();

  session.messages.push({
    id: createId("msg"),
    role: "user",
    content: input.message.trim(),
    createdAt,
  });

  session.events.push({
    id: createId("evt"),
    type: "message_received",
    level: "info",
    message: "Received a new chat instruction.",
    createdAt,
  });

  session.messages.push({
    id: createId("msg"),
    role: "assistant",
    content: buildAssistantReply(input.message.trim()),
    createdAt,
  });

  session.events.push({
    id: createId("evt"),
    type: "agent_response",
    level: "info",
    message: "Agent produced a stubbed iteration response.",
    createdAt,
  });

  session.project.artifacts.push({
    path: `app/feature-${session.project.artifacts.length + 1}.tsx`,
    summary: "Simulated generated file from latest instruction.",
  });

  session.updatedAt = createdAt;
  session.status = "ready";

  sessions.set(session.id, session);
  return session;
}

