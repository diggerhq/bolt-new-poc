import "server-only";

import type { PoolClient } from "pg";

import type { AuthUser } from "@/lib/auth/auth";
import type {
  BuilderSession,
  ChatRole,
  TraceLevel,
  TraceType,
} from "@/lib/builder/types";
import { getDbPool, runInTransaction } from "@/lib/db/postgres";
import {
  bootstrapSandbox,
  sendMessage as sendSandboxMessage,
} from "@/lib/sandbox/opencomputer";
import { createEventHandler } from "@/lib/sandbox/event-bridge";

interface CreateBuilderSessionInput {
  prompt: string;
  user: AuthUser;
}

interface AppendBuilderSessionMessageInput {
  sessionId: string;
  message: string;
  user: AuthUser;
}

interface BuilderSessionRow {
  id: string;
  project_id: string;
  user_id: string;
  preview_url: string;
  status: string;
  sandbox_id: string | null;
  sandbox_agent_session_id: string | null;
  sandbox_status: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ProjectRow {
  id: string;
  title: string;
  framework: string;
}

interface ArtifactRow {
  path: string;
  summary: string;
  position: number;
}

interface MessageRow {
  id: string;
  role: string;
  content: string;
  created_at: Date | string;
}

interface EventRow {
  id: string;
  type: string;
  level: string;
  message: string;
  created_at: Date | string;
}

const VALID_SESSION_STATUSES = new Set<BuilderSession["status"]>([
  "ready",
  "running",
  "error",
]);
const VALID_CHAT_ROLES = new Set<ChatRole>(["user", "assistant", "system"]);
const VALID_TRACE_LEVELS = new Set<TraceLevel>(["info", "warning", "error"]);
const VALID_TRACE_TYPES = new Set<TraceType>([
  "session_started",
  "planning",
  "files_generated",
  "dev_server_started",
  "preview_ready",
  "message_received",
  "agent_response",
]);

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toIsoString(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toISOString();
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


function toSessionStatus(value: string): BuilderSession["status"] {
  if (VALID_SESSION_STATUSES.has(value as BuilderSession["status"])) {
    return value as BuilderSession["status"];
  }

  return "error";
}

function toChatRole(value: string): ChatRole {
  if (VALID_CHAT_ROLES.has(value as ChatRole)) {
    return value as ChatRole;
  }

  return "assistant";
}

function toTraceLevel(value: string): TraceLevel {
  if (VALID_TRACE_LEVELS.has(value as TraceLevel)) {
    return value as TraceLevel;
  }

  return "info";
}

function toTraceType(value: string): TraceType {
  if (VALID_TRACE_TYPES.has(value as TraceType)) {
    return value as TraceType;
  }

  return "agent_response";
}

async function getSessionFromDatabase(
  sessionId: string,
  userId?: string,
): Promise<BuilderSession | null> {
  const pool = getDbPool();

  const sessionResult = userId
    ? await pool.query<BuilderSessionRow>(
        `
          select id, project_id::text as project_id, user_id, preview_url, status,
                 sandbox_id, sandbox_agent_session_id, sandbox_status,
                 created_at, updated_at
          from builder_sessions
          where id = $1 and user_id = $2
          limit 1
        `,
        [sessionId, userId],
      )
    : await pool.query<BuilderSessionRow>(
        `
          select id, project_id::text as project_id, user_id, preview_url, status,
                 sandbox_id, sandbox_agent_session_id, sandbox_status,
                 created_at, updated_at
          from builder_sessions
          where id = $1
          limit 1
        `,
        [sessionId],
      );

  const sessionRow = sessionResult.rows[0];

  if (!sessionRow) {
    return null;
  }

  const projectResult = await pool.query<ProjectRow>(
    `
      select id::text as id, title, framework
      from projects
      where id = $1
      limit 1
    `,
    [sessionRow.project_id],
  );

  const projectRow = projectResult.rows[0];

  if (!projectRow) {
    return null;
  }

  const artifactResult = await pool.query<ArtifactRow>(
    `
      select path, summary, position
      from project_artifacts
      where project_id = $1
      order by position asc
    `,
    [projectRow.id],
  );

  const messageResult = await pool.query<MessageRow>(
    `
      select id, role, content, created_at
      from session_messages
      where session_id = $1
      order by created_at asc, id asc
    `,
    [sessionRow.id],
  );

  const eventResult = await pool.query<EventRow>(
    `
      select id, type, level, message, created_at
      from session_events
      where session_id = $1
      order by created_at asc, id asc
    `,
    [sessionRow.id],
  );

  return {
    id: sessionRow.id,
    userId: sessionRow.user_id,
    previewUrl: sessionRow.preview_url,
    createdAt: toIsoString(sessionRow.created_at),
    updatedAt: toIsoString(sessionRow.updated_at),
    status: toSessionStatus(sessionRow.status),
    project: {
      title: projectRow.title,
      framework: projectRow.framework,
      artifacts: artifactResult.rows.map((row) => ({
        path: row.path,
        summary: row.summary,
      })),
    },
    messages: messageResult.rows.map((row) => ({
      id: row.id,
      role: toChatRole(row.role),
      content: row.content,
      createdAt: toIsoString(row.created_at),
    })),
    events: eventResult.rows.map((row) => ({
      id: row.id,
      type: toTraceType(row.type),
      level: toTraceLevel(row.level),
      message: row.message,
      createdAt: toIsoString(row.created_at),
    })),
  };
}

async function upsertUser(client: PoolClient, user: AuthUser): Promise<void> {
  await client.query(
    `
      insert into app_users (id, email, name)
      values ($1, $2, $3)
      on conflict (id)
      do update
        set email = excluded.email,
            name = excluded.name,
            updated_at = timezone('utc', now())
    `,
    [user.id, user.email, user.name],
  );
}

export async function createBuilderSession(
  input: CreateBuilderSessionInput,
): Promise<BuilderSession> {
  const prompt = sanitizePrompt(input.prompt);
  const sessionId = createId("session");
  const createdAt = nowIso();
  const title = toTitle(prompt);

  // Create DB records first (with status "running" and sandbox_status "creating")
  await runInTransaction(async (client) => {
    await upsertUser(client, input.user);

    const projectInsert = await client.query<ProjectRow>(
      `
        insert into projects (user_id, title, framework)
        values ($1, $2, $3)
        returning id::text as id, title, framework
      `,
      [input.user.id, title, "nextjs"],
    );

    const projectRow = projectInsert.rows[0];
    if (!projectRow) throw new Error("Database create project returned no row.");

    await client.query(
      `
        insert into builder_sessions (id, project_id, user_id, preview_url, status, sandbox_status, created_at, updated_at)
        values ($1, $2::uuid, $3, $4, $5, $6, $7, $7)
      `,
      [sessionId, projectRow.id, input.user.id, "", "running", "creating", createdAt],
    );

    await client.query(
      `
        insert into session_messages (id, session_id, role, content, created_at)
        values ($1, $2, $3, $4, $5)
      `,
      [createId("msg"), sessionId, "user", prompt, createdAt],
    );

    await client.query(
      `
        insert into session_events (id, session_id, type, level, message, created_at)
        values ($1, $2, $3, $4, $5, $6)
      `,
      [createId("evt"), sessionId, "session_started", "info", "Bootstrapping sandbox...", createdAt],
    );
  });

  // Bootstrap sandbox + start agent (async — events stream via event bridge)
  const onEvent = createEventHandler(sessionId);

  try {
    const handle = await bootstrapSandbox(sessionId, prompt, onEvent);

    // Update session with sandbox details
    const pool = getDbPool();
    await pool.query(
      `
        update builder_sessions
        set sandbox_id = $2,
            sandbox_agent_session_id = $3,
            sandbox_status = 'running',
            preview_url = $4,
            updated_at = now()
        where id = $1
      `,
      [sessionId, handle.sandboxId, handle.agentSessionId, handle.previewUrl],
    );
  } catch (err) {
    // Mark session as error if bootstrap fails
    const pool = getDbPool();
    await pool.query(
      `
        update builder_sessions
        set status = 'error', sandbox_status = 'dead', updated_at = now()
        where id = $1
      `,
      [sessionId],
    );
    await pool.query(
      `
        insert into session_events (id, session_id, type, level, message, created_at)
        values ($1, $2, $3, $4, $5, now())
      `,
      [createId("evt"), sessionId, "error", "error", `Sandbox bootstrap failed: ${err instanceof Error ? err.message : String(err)}`],
    );
    // Still return the session (in error state) so the UI can show the failure
  }

  const session = await getSessionFromDatabase(sessionId, input.user.id);
  if (!session) throw new Error("Session was created but could not be loaded.");
  return session;
}

export async function getBuilderSession(
  sessionId: string,
  userId?: string,
): Promise<BuilderSession | null> {
  return getSessionFromDatabase(sessionId, userId);
}

export async function appendBuilderSessionMessage(
  input: AppendBuilderSessionMessageInput,
): Promise<BuilderSession | null> {
  const message = input.message.trim();

  if (message.length === 0) {
    throw new Error("Message is required for iteration.");
  }

  // Look up session + sandbox info
  const pool = getDbPool();
  const sessionLookup = await pool.query<{
    sandbox_id: string | null;
    sandbox_agent_session_id: string | null;
    sandbox_status: string | null;
  }>(
    `
      select sandbox_id, sandbox_agent_session_id, sandbox_status
      from builder_sessions
      where id = $1 and user_id = $2
      limit 1
    `,
    [input.sessionId, input.user.id],
  );

  const row = sessionLookup.rows[0];
  if (!row) return null;

  // Persist user message
  const createdAt = nowIso();
  await pool.query(
    `
      insert into session_messages (id, session_id, role, content, created_at)
      values ($1, $2, $3, $4, $5)
    `,
    [createId("msg"), input.sessionId, "user", message, createdAt],
  );

  // Mark session as running
  await pool.query(
    `
      update builder_sessions set status = 'running', updated_at = now()
      where id = $1
    `,
    [input.sessionId],
  );

  // Send prompt to sandbox agent
  if (row.sandbox_id && row.sandbox_agent_session_id && row.sandbox_status === "running") {
    const onEvent = createEventHandler(input.sessionId);
    try {
      await sendSandboxMessage(
        input.sessionId,
        row.sandbox_id,
        row.sandbox_agent_session_id,
        message,
        onEvent,
      );
    } catch (err) {
      await pool.query(
        `
          insert into session_events (id, session_id, type, level, message, created_at)
          values ($1, $2, $3, $4, $5, now())
        `,
        [createId("evt"), input.sessionId, "error", "error", `Failed to send message: ${err instanceof Error ? err.message : String(err)}`],
      );
      await pool.query(
        `update builder_sessions set status = 'error', updated_at = now() where id = $1`,
        [input.sessionId],
      );
    }
  } else {
    // No sandbox — persist as error
    await pool.query(
      `
        insert into session_events (id, session_id, type, level, message, created_at)
        values ($1, $2, $3, $4, $5, now())
      `,
      [createId("evt"), input.sessionId, "error", "error", "No active sandbox for this session."],
    );
    await pool.query(
      `update builder_sessions set status = 'error', updated_at = now() where id = $1`,
      [input.sessionId],
    );
  }

  return getSessionFromDatabase(input.sessionId, input.user.id);
}
