import "server-only";

import type { AgentEvent } from "@opencomputer/sdk";
import { getDbPool } from "@/lib/db/postgres";

type Subscriber = (event: AgentEvent) => void;

// In-memory subscriber map: sessionId -> Set of SSE push callbacks
const subscribers = new Map<string, Set<Subscriber>>();

export function subscribe(sessionId: string, cb: Subscriber): () => void {
  let subs = subscribers.get(sessionId);
  if (!subs) {
    subs = new Set();
    subscribers.set(sessionId, subs);
  }
  subs.add(cb);

  return () => {
    subs!.delete(cb);
    if (subs!.size === 0) {
      subscribers.delete(sessionId);
    }
  };
}

function notifySubscribers(sessionId: string, event: AgentEvent): void {
  const subs = subscribers.get(sessionId);
  if (!subs) return;
  for (const cb of subs) {
    try {
      cb(event);
    } catch {
      // subscriber error — don't crash the bridge
    }
  }
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function mapEventType(event: AgentEvent): string {
  return event.type ?? "agent_response";
}

function mapEventLevel(event: AgentEvent): string {
  if (event.type === "error") return "error";
  return "info";
}

function eventMessage(event: AgentEvent): string {
  if (typeof event.message === "string") return event.message;
  if (event.type === "assistant" && event.message && typeof (event.message as { content?: unknown }).content === "string") {
    return ((event.message as { content: string }).content).slice(0, 500);
  }
  if (event.type === "tool_use_summary" && typeof event.tool === "string") {
    return `Tool: ${event.tool}`;
  }
  if (event.type === "turn_complete") return "Turn complete.";
  if (event.type === "ready") return "Agent ready.";
  if (event.type === "configured") return "Agent configured.";
  if (event.type === "error" && typeof event.message === "string") return event.message;
  return event.type ?? "Unknown event";
}

export function createEventHandler(sessionId: string) {
  return async (event: AgentEvent): Promise<void> => {
    // 1. Persist to database
    try {
      const pool = getDbPool();
      await pool.query(
        `INSERT INTO session_events (id, session_id, type, level, message, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          createId("evt"),
          sessionId,
          mapEventType(event),
          mapEventLevel(event),
          eventMessage(event),
          JSON.stringify(event),
        ],
      );
    } catch (err) {
      console.error("[event-bridge] failed to persist event:", err);
    }

    // 2. Push to SSE subscribers
    notifySubscribers(sessionId, event);
  };
}
