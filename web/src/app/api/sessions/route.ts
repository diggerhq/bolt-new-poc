import * as fs from "node:fs";
import * as path from "node:path";
import { getCurrentUser } from "@/lib/auth";

const AGENT_DIR = path.resolve(process.cwd(), "..", "agent");

function platformUrl(p: string) {
  return `${(process.env.PLATFORM_API_URL ?? "http://localhost:8081").replace(/\/+$/, "")}${p}`;
}
function apiKey() {
  return process.env.OPENCOMPUTER_API_KEY ?? "";
}
function loadAgentConfig() {
  const config: { systemPrompt?: string; skills?: Record<string, string> } = {};
  const promptPath = path.join(AGENT_DIR, "prompt.md");
  const skillPath = path.join(AGENT_DIR, ".claude", "skills", "build-app", "SKILL.md");
  if (fs.existsSync(promptPath)) config.systemPrompt = fs.readFileSync(promptPath, "utf-8");
  if (fs.existsSync(skillPath)) config.skills = { ".claude/skills/build-app/SKILL.md": fs.readFileSync(skillPath, "utf-8") };
  return config;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return Response.json({ error: "Prompt is required." }, { status: 400 });

  const resp = await fetch(platformUrl("/v1/sessions"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey() },
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
    return Response.json({ error: text }, { status: resp.status });
  }

  const session = await resp.json();
  const eventsUrl = `${platformUrl(`/v1/sessions/${session.id}/events`)}?api_key=${encodeURIComponent(apiKey())}`;

  return Response.json({ session, eventsUrl });
}
