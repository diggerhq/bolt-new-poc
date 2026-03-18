import type pg from "pg";
import type { BuilderSession, ChatRole, TraceLevel } from "./types.js";
import { getDbPool, runInTransaction } from "./db.js";
import { bootstrapSandbox, sendMessage as sendSandboxMessage } from "./opencomputer.js";
import { createEventHandler } from "./event-bridge.js";

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

interface ProjectRow { id: string; title: string; framework: string }
interface ArtifactRow { path: string; summary: string; position: number }
interface MessageRow { id: string; role: string; content: string; created_at: Date | string }
interface EventRow { id: string; type: string; level: string; message: string; created_at: Date | string }

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toIsoString(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
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
  if (compact.length === 0) return "Generated App";
  return compact[0]?.toUpperCase() + compact.slice(1);
}

const VALID_STATUSES = new Set(["ready", "running", "error"]);
const VALID_ROLES = new Set(["user", "assistant", "system"]);
const VALID_LEVELS = new Set(["info", "warning", "error"]);

function toStatus(v: string): BuilderSession["status"] {
  return VALID_STATUSES.has(v) ? (v as BuilderSession["status"]) : "error";
}
function toRole(v: string): ChatRole {
  return VALID_ROLES.has(v) ? (v as ChatRole) : "assistant";
}
function toLevel(v: string): TraceLevel {
  return VALID_LEVELS.has(v) ? (v as TraceLevel) : "info";
}

async function upsertUser(client: pg.PoolClient, userId: string, email: string, name: string): Promise<void> {
  await client.query(
    `INSERT INTO app_users (id, email, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET email = excluded.email, name = excluded.name, updated_at = timezone('utc', now())`,
    [userId, email, name],
  );
}

async function getSessionFromDatabase(sessionId: string, userId?: string): Promise<BuilderSession | null> {
  const pool = getDbPool();

  const sessionResult = userId
    ? await pool.query<BuilderSessionRow>(
        `SELECT id, project_id::text as project_id, user_id, preview_url, status,
                sandbox_id, sandbox_agent_session_id, sandbox_status, created_at, updated_at
         FROM builder_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [sessionId, userId],
      )
    : await pool.query<BuilderSessionRow>(
        `SELECT id, project_id::text as project_id, user_id, preview_url, status,
                sandbox_id, sandbox_agent_session_id, sandbox_status, created_at, updated_at
         FROM builder_sessions WHERE id = $1 LIMIT 1`,
        [sessionId],
      );

  const row = sessionResult.rows[0];
  if (!row) return null;

  const projectResult = await pool.query<ProjectRow>(
    `SELECT id::text as id, title, framework FROM projects WHERE id = $1 LIMIT 1`,
    [row.project_id],
  );
  const projectRow = projectResult.rows[0];
  if (!projectRow) return null;

  const [artifacts, messages, events] = await Promise.all([
    pool.query<ArtifactRow>(
      `SELECT path, summary, position FROM project_artifacts WHERE project_id = $1 ORDER BY position ASC`,
      [projectRow.id],
    ),
    pool.query<MessageRow>(
      `SELECT id, role, content, created_at FROM session_messages WHERE session_id = $1 ORDER BY created_at ASC, id ASC`,
      [row.id],
    ),
    pool.query<EventRow>(
      `SELECT id, type, level, message, created_at FROM session_events WHERE session_id = $1 ORDER BY created_at ASC, id ASC`,
      [row.id],
    ),
  ]);

  return {
    id: row.id,
    userId: row.user_id,
    previewUrl: row.preview_url,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    status: toStatus(row.status),
    sandboxId: row.sandbox_id,
    project: {
      title: projectRow.title,
      framework: projectRow.framework,
      artifacts: artifacts.rows.map((r) => ({ path: r.path, summary: r.summary })),
    },
    messages: messages.rows.map((r) => ({
      id: r.id,
      role: toRole(r.role),
      content: r.content,
      createdAt: toIsoString(r.created_at),
    })),
    events: events.rows.map((r) => ({
      id: r.id,
      type: r.type,
      level: toLevel(r.level),
      message: r.message,
      createdAt: toIsoString(r.created_at),
    })),
  };
}

export async function createBuilderSession(input: {
  prompt: string;
  userId: string;
  userEmail: string;
  userName: string;
  apiKey: string;
}): Promise<BuilderSession> {
  const prompt = sanitizePrompt(input.prompt);
  const sessionId = createId("session");
  const createdAt = nowIso();
  const title = toTitle(prompt);

  await runInTransaction(async (client) => {
    await upsertUser(client, input.userId, input.userEmail, input.userName);

    const projectInsert = await client.query<ProjectRow>(
      `INSERT INTO projects (user_id, title, framework) VALUES ($1, $2, $3) RETURNING id::text as id, title, framework`,
      [input.userId, title, "nextjs"],
    );
    const projectRow = projectInsert.rows[0];
    if (!projectRow) throw new Error("Database create project returned no row.");

    await client.query(
      `INSERT INTO builder_sessions (id, project_id, user_id, preview_url, status, sandbox_status, created_at, updated_at)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $7)`,
      [sessionId, projectRow.id, input.userId, "", "running", "creating", createdAt],
    );

    await client.query(
      `INSERT INTO session_messages (id, session_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [createId("msg"), sessionId, "user", prompt, createdAt],
    );

    await client.query(
      `INSERT INTO session_events (id, session_id, type, level, message, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [createId("evt"), sessionId, "session_started", "info", "Bootstrapping sandbox...", createdAt],
    );
  });

  const onEvent = createEventHandler(sessionId);

  try {
    const handle = await bootstrapSandbox(sessionId, prompt, input.apiKey, onEvent);
    const pool = getDbPool();
    await pool.query(
      `UPDATE builder_sessions
       SET sandbox_id = $2, sandbox_agent_session_id = $3, sandbox_status = 'running', preview_url = $4, updated_at = now()
       WHERE id = $1`,
      [sessionId, handle.sandboxId, handle.agentSessionId, handle.previewUrl],
    );
  } catch (err) {
    const pool = getDbPool();
    await pool.query(
      `UPDATE builder_sessions SET status = 'error', sandbox_status = 'dead', updated_at = now() WHERE id = $1`,
      [sessionId],
    );
    await pool.query(
      `INSERT INTO session_events (id, session_id, type, level, message, created_at) VALUES ($1, $2, $3, $4, $5, now())`,
      [createId("evt"), sessionId, "error", "error", `Sandbox bootstrap failed: ${err instanceof Error ? err.message : String(err)}`],
    );
  }

  const session = await getSessionFromDatabase(sessionId, input.userId);
  if (!session) throw new Error("Session was created but could not be loaded.");
  return session;
}

export async function getBuilderSession(sessionId: string, userId?: string): Promise<BuilderSession | null> {
  return getSessionFromDatabase(sessionId, userId);
}

export async function appendMessage(input: {
  sessionId: string;
  message: string;
  userId: string;
  apiKey: string;
}): Promise<BuilderSession | null> {
  const message = input.message.trim();
  if (message.length === 0) throw new Error("Message is required.");

  const pool = getDbPool();
  const lookup = await pool.query<{
    sandbox_id: string | null;
    sandbox_agent_session_id: string | null;
    sandbox_status: string | null;
  }>(
    `SELECT sandbox_id, sandbox_agent_session_id, sandbox_status
     FROM builder_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [input.sessionId, input.userId],
  );

  const row = lookup.rows[0];
  if (!row) return null;

  const createdAt = nowIso();
  await pool.query(
    `INSERT INTO session_messages (id, session_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [createId("msg"), input.sessionId, "user", message, createdAt],
  );
  await pool.query(
    `UPDATE builder_sessions SET status = 'running', updated_at = now() WHERE id = $1`,
    [input.sessionId],
  );

  if (row.sandbox_id && row.sandbox_agent_session_id && row.sandbox_status === "running") {
    const onEvent = createEventHandler(input.sessionId);
    try {
      await sendSandboxMessage(input.sessionId, row.sandbox_id, row.sandbox_agent_session_id, message, input.apiKey, onEvent);
    } catch (err) {
      await pool.query(
        `INSERT INTO session_events (id, session_id, type, level, message, created_at) VALUES ($1, $2, $3, $4, $5, now())`,
        [createId("evt"), input.sessionId, "error", "error", `Failed to send message: ${err instanceof Error ? err.message : String(err)}`],
      );
      await pool.query(
        `UPDATE builder_sessions SET status = 'error', updated_at = now() WHERE id = $1`,
        [input.sessionId],
      );
    }
  } else {
    await pool.query(
      `INSERT INTO session_events (id, session_id, type, level, message, created_at) VALUES ($1, $2, $3, $4, $5, now())`,
      [createId("evt"), input.sessionId, "error", "error", "No active sandbox for this session."],
    );
    await pool.query(
      `UPDATE builder_sessions SET status = 'error', updated_at = now() WHERE id = $1`,
      [input.sessionId],
    );
  }

  return getSessionFromDatabase(input.sessionId, input.userId);
}
