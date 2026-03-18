import "server-only";

import * as fs from "node:fs";
import * as path from "node:path";

const AGENT_DIR = path.resolve(process.cwd(), "..", "agent");

function getConfig() {
  const baseUrl = (process.env.PLATFORM_API_URL ?? "http://localhost:8081").replace(/\/+$/, "");
  const apiKey = process.env.OPENCOMPUTER_API_KEY ?? "";
  if (!apiKey) throw new Error("OPENCOMPUTER_API_KEY is required");
  return { baseUrl, apiKey };
}

function loadAgentConfig() {
  const promptPath = path.join(AGENT_DIR, "prompt.md");
  const skillPath = path.join(AGENT_DIR, ".claude", "skills", "build-app", "SKILL.md");

  const config: { systemPrompt?: string; skills?: Record<string, string> } = {};

  if (fs.existsSync(promptPath)) {
    config.systemPrompt = fs.readFileSync(promptPath, "utf-8");
  }
  if (fs.existsSync(skillPath)) {
    config.skills = { ".claude/skills/build-app/SKILL.md": fs.readFileSync(skillPath, "utf-8") };
  }

  return config;
}

async function request(path: string, opts: RequestInit = {}): Promise<Response> {
  const { baseUrl, apiKey } = getConfig();
  const resp = await fetch(`${baseUrl}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...opts.headers,
    },
  });
  return resp;
}

export async function createSession(prompt: string, user: { id: string; email: string; name: string }) {
  const resp = await request("/v1/sessions", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      user_id: user.id,
      user_email: user.email,
      user_name: user.name,
      agent_config: loadAgentConfig(),
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Platform API error (${resp.status}): ${text}`);
  }

  return resp.json();
}

export async function getSession(sessionId: string, userId?: string) {
  const params = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  const resp = await request(`/v1/sessions/${sessionId}${params}`);

  if (!resp.ok) return null;
  return resp.json();
}

export async function sendMessage(sessionId: string, message: string, userId: string) {
  const resp = await request(`/v1/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message, user_id: userId }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Platform API error (${resp.status}): ${text}`);
  }

  return resp.json();
}

export function getEventsUrl(sessionId: string): string {
  const { baseUrl, apiKey } = getConfig();
  return `${baseUrl}/v1/sessions/${sessionId}/events?api_key=${encodeURIComponent(apiKey)}`;
}
