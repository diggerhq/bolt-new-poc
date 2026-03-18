import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createBuilderSession, getBuilderSession, appendMessage } from "../lib/store.js";
import { subscribe } from "../lib/event-bridge.js";
import { killSandbox } from "../lib/opencomputer.js";
import { getDbPool } from "../lib/db.js";

const app = new Hono();

// Middleware: extract API key
function getApiKey(c: { req: { header: (name: string) => string | undefined } }): string {
  const key = c.req.header("X-API-Key") ?? "";
  if (!key) throw new Error("X-API-Key header is required");
  return key;
}

// POST /v1/sessions
app.post("/", async (c) => {
  const apiKey = getApiKey(c);
  const body = await c.req.json();

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  const userEmail = typeof body.user_email === "string" ? body.user_email : "";
  const userName = typeof body.user_name === "string" ? body.user_name : "";

  if (!prompt) return c.json({ error: { type: "invalid_request", message: "prompt is required" } }, 400);
  if (!userId) return c.json({ error: { type: "invalid_request", message: "user_id is required" } }, 400);

  const session = await createBuilderSession({ prompt, userId, userEmail, userName, apiKey });
  return c.json(session, 201);
});

// GET /v1/sessions/:sessionId
app.get("/:sessionId", async (c) => {
  const { sessionId } = c.req.param();
  const userId = c.req.query("user_id");

  const session = await getBuilderSession(sessionId, userId || undefined);
  if (!session) return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  return c.json(session);
});

// POST /v1/sessions/:sessionId/messages
app.post("/:sessionId/messages", async (c) => {
  const apiKey = getApiKey(c);
  const { sessionId } = c.req.param();
  const body = await c.req.json();

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const userId = typeof body.user_id === "string" ? body.user_id : "";

  if (!message) return c.json({ error: { type: "invalid_request", message: "message is required" } }, 400);
  if (!userId) return c.json({ error: { type: "invalid_request", message: "user_id is required" } }, 400);

  const session = await appendMessage({ sessionId, message, userId, apiKey });
  if (!session) return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  return c.json(session);
});

// GET /v1/sessions/:sessionId/events (SSE)
app.get("/:sessionId/events", async (c) => {
  const { sessionId } = c.req.param();
  const userId = c.req.query("user_id");

  const session = await getBuilderSession(sessionId, userId || undefined);
  if (!session) return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);

  return streamSSE(c, async (stream) => {
    // Replay existing events from DB so client catches up
    try {
      const pool = getDbPool();
      const result = await pool.query<{ metadata: unknown }>(
        `SELECT metadata FROM session_events WHERE session_id = $1 ORDER BY created_at ASC, id ASC`,
        [sessionId],
      );
      for (const row of result.rows) {
        if (row.metadata && typeof row.metadata === "object") {
          await stream.writeSSE({ data: JSON.stringify(row.metadata) });
        }
      }
    } catch (err) {
      console.error("[sse] failed to replay events:", err);
    }

    // Subscribe to live events going forward
    const unsubscribe = subscribe(sessionId, (event) => {
      stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {});
    });

    // Keep alive
    const interval = setInterval(() => {
      stream.writeSSE({ event: "ping", data: "" }).catch(() => {
        clearInterval(interval);
        unsubscribe();
      });
    }, 15_000);

    // Wait until client disconnects
    try {
      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve());
      });
    } finally {
      clearInterval(interval);
      unsubscribe();
    }
  });
});

// DELETE /v1/sessions/:sessionId
app.delete("/:sessionId", async (c) => {
  const apiKey = getApiKey(c);
  const { sessionId } = c.req.param();
  const userId = c.req.query("user_id");

  const session = await getBuilderSession(sessionId, userId || undefined);
  if (!session) return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);

  if (session.sandboxId) {
    try {
      await killSandbox(session.sandboxId, apiKey);
    } catch {
      // sandbox may already be dead
    }
  }

  const { getDbPool } = await import("../lib/db.js");
  await getDbPool().query(
    `UPDATE builder_sessions SET status = 'error', sandbox_status = 'dead', updated_at = now() WHERE id = $1`,
    [sessionId],
  );

  return c.json({ id: sessionId, status: "ended" });
});

export default app;
