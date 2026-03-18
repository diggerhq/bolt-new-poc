"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { AuthUser } from "@/lib/auth/auth";
import type { BuilderSession, TraceEvent } from "@/lib/builder/types";

interface SessionResponse {
  session: BuilderSession;
}

interface BuilderShellProps {
  initialUser: AuthUser;
}

export function BuilderShell({ initialUser }: BuilderShellProps) {
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<BuilderSession | null>(null);
  const [liveEvents, setLiveEvents] = useState<TraceEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const canStart = prompt.trim().length > 0 && !loading;
  const canSend = message.trim().length > 0 && session !== null && !loading;

  // Subscribe to SSE events when session is created
  useEffect(() => {
    if (!session) return;

    // Close previous connection if any
    eventSourceRef.current?.close();

    const es = new EventSource(`/api/sessions/${session.id}/events`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        const traceEvent: TraceEvent = {
          id: parsed.session_id ?? crypto.randomUUID(),
          type: parsed.type ?? "agent_response",
          level: parsed.type === "error" ? "error" : "info",
          message:
            typeof parsed.message === "string"
              ? parsed.message
              : parsed.type === "tool_use_summary" && typeof parsed.tool === "string"
                ? `Tool: ${parsed.tool}`
                : parsed.type === "turn_complete"
                  ? "Turn complete."
                  : parsed.type ?? "Event",
          createdAt: new Date().toISOString(),
        };
        setLiveEvents((prev) => [...prev, traceEvent]);
      } catch {
        // ignore non-JSON
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [session?.id]);

  // Merge DB events (from session) with live SSE events, deduplicated
  const sortedEvents = useMemo(() => {
    const dbEvents = session?.events ?? [];
    const seenIds = new Set(dbEvents.map((e) => e.id));
    const merged = [...dbEvents, ...liveEvents.filter((e) => !seenIds.has(e.id))];
    return merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [session, liveEvents]);

  async function startSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start session (${response.status})`);
      }

      const data = (await response.json()) as SessionResponse;
      setSession(data.session);
      setPrompt("");
    } catch (caughtError) {
      const messageText =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to start session";
      setError(messageText);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message (${response.status})`);
      }

      const data = (await response.json()) as SessionResponse;
      setSession(data.session);
      setMessage("");
    } catch (caughtError) {
      const messageText =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to send message";
      setError(messageText);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-5 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Builder Console
              </h1>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Signed in as {initialUser.email}
              </p>
            </div>
            <form action="/api/auth/sign-out" method="post">
                <button
                  type="submit"
                  className="rounded-lg border border-slate-500/50 px-3 py-2 text-sm hover:bg-slate-800"
                >
                  Logout
                </button>
              </form>
          </div>
        </header>

        {error ? (
          <p className="mb-4 rounded-lg border border-rose-300/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 sm:p-5">
            <h2 className="text-sm font-semibold tracking-wide text-cyan-100 uppercase">
              Prompt + Chat
            </h2>

            {!session ? (
              <form className="mt-4 space-y-3" onSubmit={startSession}>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  rows={5}
                  placeholder="Describe the app you want to build..."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--card-bg-muted)] p-3 text-sm outline-none ring-cyan-300/40 focus:ring"
                />
                <button
                  type="submit"
                  disabled={!canStart}
                  className="inline-flex rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Starting..." : "Start Session"}
                </button>
              </form>
            ) : (
              <div className="mt-4">
                <p className="mb-2 text-xs text-[var(--text-muted)]">
                  Session: {session.id}
                </p>
                <div className="max-h-[380px] space-y-3 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card-bg-muted)] p-3">
                  {session.messages.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-white/5 bg-slate-900/60 p-2"
                    >
                      <p className="text-[11px] font-semibold tracking-wide text-cyan-200 uppercase">
                        {item.role}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
                        {item.content}
                      </p>
                    </div>
                  ))}
                </div>
                <form className="mt-3 flex gap-2" onSubmit={sendMessage}>
                  <input
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Ask the agent to iterate..."
                    className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card-bg-muted)] px-3 py-2 text-sm outline-none ring-cyan-300/40 focus:ring"
                  />
                  <button
                    type="submit"
                    disabled={!canSend}
                    className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Sending..." : "Send"}
                  </button>
                </form>
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 sm:p-5">
            <h2 className="text-sm font-semibold tracking-wide text-cyan-100 uppercase">
              Trace Timeline
            </h2>
            {!session ? (
              <p className="mt-4 text-sm text-[var(--text-muted)]">
                Start a session to populate trace events.
              </p>
            ) : (
              <ol className="mt-4 max-h-[460px] space-y-2 overflow-y-auto pr-1">
                {sortedEvents.map((eventItem) => (
                  <li
                    key={eventItem.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--card-bg-muted)] p-3"
                  >
                    <p className="text-[11px] tracking-wide text-cyan-200 uppercase">
                      {eventItem.type}
                    </p>
                    <p className="mt-1 text-sm">{eventItem.message}</p>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      {new Date(eventItem.createdAt).toLocaleTimeString()}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </article>

          <article className="rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 sm:p-5">
            <h2 className="text-sm font-semibold tracking-wide text-cyan-100 uppercase">
              Preview
            </h2>
            {!session ? (
              <p className="mt-4 text-sm text-[var(--text-muted)]">
                Preview appears after the initial scaffold is created.
              </p>
            ) : (
              <div className="mt-4">
                <p className="mb-2 text-xs text-[var(--text-muted)]">
                  {session.previewUrl}
                </p>
                <iframe
                  title="M0 preview"
                  src={session.previewUrl}
                  className="h-[460px] w-full rounded-lg border border-[var(--border)] bg-slate-950"
                />
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}
