"use client";

import { useEffect, useRef, useState } from "react";

import type { AuthUser } from "@/lib/auth/auth";
import type { BuilderSession } from "@/lib/builder/types";

// Raw agent event from SSE — preserve full structure
interface AgentEvent {
  type: string;
  // assistant events
  message?: {
    content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    [key: string]: unknown;
  };
  // tool_use_summary
  tool?: string;
  // result events
  result?: string;
  subtype?: string;
  // error
  error?: string;
  [key: string]: unknown;
}

interface SessionResponse {
  session: BuilderSession;
  eventsUrl?: string;
}

interface BuilderShellProps {
  initialUser: AuthUser;
  initialSessionId?: string;
}

function extractEventContent(event: AgentEvent): string | null {
  switch (event.type) {
    case "assistant": {
      const blocks = event.message?.content;
      if (!Array.isArray(blocks)) return null;
      const parts: string[] = [];
      for (const block of blocks) {
        if (block.type === "text" && block.text) {
          parts.push(block.text);
        } else if (block.type === "tool_use" && block.name) {
          const inputStr = block.input
            ? JSON.stringify(block.input).slice(0, 200)
            : "";
          parts.push(`${block.name}(${inputStr}${inputStr.length >= 200 ? "..." : ""})`);
        }
      }
      return parts.join("\n") || null;
    }
    case "tool_use_summary":
      return event.tool ? `Tool: ${event.tool}` : null;
    case "result":
      return event.result
        ? `Result: ${String(event.result).slice(0, 300)}`
        : "Done.";
    case "turn_complete":
      return null; // rendered as a divider
    case "error":
      return (typeof event.message === "string" ? event.message : null)
        ?? (typeof event.error === "string" ? event.error : "Unknown error");
    case "ready":
    case "configured":
      return null; // skip noise
    default:
      return typeof event.message === "string" ? event.message : null;
  }
}

export function BuilderShell({ initialUser, initialSessionId }: BuilderShellProps) {
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<BuilderSession | null>(null);
  const [eventsUrl, setEventsUrl] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<AgentEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const canStart = prompt.trim().length > 0 && !loading;
  const canSend = message.trim().length > 0 && session !== null && !loading;

  // Restore session from URL on mount
  useEffect(() => {
    if (!initialSessionId) return;

    setLoading(true);
    fetch(`/api/sessions/${initialSessionId}`)
      .then((resp) => {
        if (!resp.ok) throw new Error("Session not found");
        return resp.json() as Promise<SessionResponse>;
      })
      .then((data) => {
        setSession(data.session);
        if (data.eventsUrl) setEventsUrl(data.eventsUrl);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to restore session");
      })
      .finally(() => setLoading(false));
  }, [initialSessionId]);

  // Subscribe to SSE events directly from platform API
  useEffect(() => {
    if (!eventsUrl) return;

    eventSourceRef.current?.close();

    const es = new EventSource(eventsUrl);

    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as AgentEvent;
        setLiveEvents((prev) => [...prev, parsed]);
      } catch {
        // ignore
      }
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [eventsUrl]);

  // Auto-scroll timeline
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [liveEvents]);

  async function startSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    setLiveEvents([]);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start session (${response.status})`);
      }

      const data = (await response.json()) as SessionResponse;
      setSession(data.session);
      if (data.eventsUrl) setEventsUrl(data.eventsUrl);
      setPrompt("");
      window.history.pushState(null, "", `/builder/${data.session.id}`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to start session",
      );
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/api/sessions/${session.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send message (${response.status})`);
      }

      const data = (await response.json()) as SessionResponse;
      setSession(data.session);
      setMessage("");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to send message",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-5 flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] px-5 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Builder</h1>
            <p className="text-xs text-[var(--text-muted)]">{initialUser.email}</p>
          </div>
          <form action="/api/auth/sign-out" method="post">
            <button
              type="submit"
              className="rounded border border-slate-600 px-2.5 py-1.5 text-xs hover:bg-slate-800"
            >
              Logout
            </button>
          </form>
        </header>

        {error ? (
          <p className="mb-4 rounded-lg border border-rose-300/40 bg-rose-900/20 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr_1.2fr]">
          {/* Prompt + Chat */}
          <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Chat
            </h2>

            {!session ? (
              <form className="flex flex-1 flex-col gap-3" onSubmit={startSession}>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  placeholder="Describe the app you want to build..."
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card-bg-muted)] p-3 text-sm outline-none ring-cyan-300/40 focus:ring"
                />
                <button
                  type="submit"
                  disabled={!canStart}
                  className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
                >
                  {loading ? "Starting..." : "Start"}
                </button>
              </form>
            ) : (
              <div className="flex flex-1 flex-col">
                <div className="flex-1 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 280px)" }}>
                  {session.messages.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded-lg px-3 py-2 text-sm ${
                        item.role === "user"
                          ? "ml-8 bg-cyan-900/30 text-cyan-100"
                          : "mr-8 bg-slate-800/60 text-slate-200"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{item.content}</p>
                    </div>
                  ))}
                </div>
                <form className="mt-3 flex gap-2" onSubmit={sendMessage}>
                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Ask the agent to iterate..."
                    className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card-bg-muted)] px-3 py-2 text-sm outline-none ring-cyan-300/40 focus:ring"
                  />
                  <button
                    type="submit"
                    disabled={!canSend}
                    className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
                  >
                    {loading ? "..." : "Send"}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Trace Timeline */}
          <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Agent Activity
            </h2>
            {!session ? (
              <p className="text-sm text-[var(--text-muted)]">
                Start a session to see agent activity.
              </p>
            ) : (
              <div
                ref={timelineRef}
                className="flex-1 space-y-0.5 overflow-y-auto font-mono text-xs"
                style={{ maxHeight: "calc(100vh - 240px)" }}
              >
                {liveEvents.length === 0 && (
                  <p className="text-slate-500">Waiting for agent...</p>
                )}
                {liveEvents.map((ev, i) => {
                  if (ev.type === "ready" || ev.type === "configured") return null;

                  if (ev.type === "turn_complete") {
                    return (
                      <div key={i} className="my-2 border-t border-slate-700/50" />
                    );
                  }

                  const content = extractEventContent(ev);
                  if (!content) return null;

                  const isError = ev.type === "error";
                  const isToolCall = ev.type === "assistant" && content.includes("(");
                  const isText = ev.type === "assistant" && !isToolCall;

                  return (
                    <div
                      key={i}
                      className={`rounded px-2 py-1 leading-relaxed ${
                        isError
                          ? "bg-rose-900/20 text-rose-300"
                          : isToolCall
                            ? "bg-amber-900/10 text-amber-200/80"
                            : isText
                              ? "text-slate-300"
                              : "text-slate-400"
                      }`}
                    >
                      <span className="whitespace-pre-wrap break-all">{content}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Preview
            </h2>
            {!session ? (
              <p className="text-sm text-[var(--text-muted)]">
                Preview appears after the scaffold is created.
              </p>
            ) : (
              <>
                {session.previewUrl && (
                  <p className="mb-2 truncate text-[10px] text-slate-500">
                    {session.previewUrl}
                  </p>
                )}
                <iframe
                  title="Preview"
                  src={session.previewUrl || "about:blank"}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-slate-950"
                  style={{ minHeight: "calc(100vh - 260px)" }}
                />
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
