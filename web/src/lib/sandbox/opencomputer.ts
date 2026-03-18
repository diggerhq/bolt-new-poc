import "server-only";

import { Sandbox, type AgentSession, type AgentEvent } from "@opencomputer/sdk";
import * as fs from "node:fs";
import * as path from "node:path";

const AGENT_DIR = path.resolve(process.cwd(), "..", "agent");
const SANDBOX_TIMEOUT = 3600; // 1 hour idle
const DEV_SERVER_PORT = 3000;

function getConfig() {
  const apiKey = process.env.OPENCOMPUTER_API_KEY;
  const apiUrl = process.env.OPENCOMPUTER_API_URL ?? "https://app.opencomputer.dev";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) throw new Error("OPENCOMPUTER_API_KEY is required");
  if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is required");

  return { apiKey, apiUrl, anthropicApiKey };
}

function loadSystemPrompt(): string {
  const promptPath = path.join(AGENT_DIR, "prompt.md");
  return fs.readFileSync(promptPath, "utf-8");
}

export interface SandboxHandle {
  sandboxId: string;
  previewUrl: string;
  agentSessionId: string;
}

export async function bootstrapSandbox(
  prompt: string,
  onEvent: (event: AgentEvent) => void,
): Promise<{ handle: SandboxHandle; agentSession: AgentSession }> {
  const { apiKey, apiUrl, anthropicApiKey } = getConfig();

  // 1. Create sandbox
  const sandbox = await Sandbox.create({
    apiKey,
    apiUrl,
    template: "base",
    timeout: SANDBOX_TIMEOUT,
    envs: { ANTHROPIC_API_KEY: anthropicApiKey },
  });

  try {
    // 2. Sync agent skills into sandbox
    await syncAgentConfig(sandbox);

    // 3. Scaffold project workspace
    await sandbox.exec.run("mkdir -p /workspace/app", { timeout: 10 });

    // 4. Start agent session with the user's prompt
    const systemPrompt = loadSystemPrompt();
    const agentSession = await sandbox.agent.start({
      prompt,
      systemPrompt,
      allowedTools: ["bash", "read", "write", "edit", "glob", "grep"],
      cwd: "/workspace/app",
      onEvent,
      onError: (data) => {
        console.error("[sandbox agent stderr]", data);
      },
    });

    // 5. Get preview URL (agent will start dev server as part of its work)
    let previewUrl = "";
    try {
      const preview = await sandbox.createPreviewURL({ port: DEV_SERVER_PORT });
      previewUrl = `https://${preview.hostname}`;
    } catch {
      // Preview URL may fail if dev server isn't up yet — that's ok,
      // we'll update it later when the agent starts the server
    }

    return {
      handle: {
        sandboxId: sandbox.sandboxId,
        previewUrl,
        agentSessionId: agentSession.sessionId,
      },
      agentSession,
    };
  } catch (err) {
    // Cleanup on failure
    await sandbox.kill().catch(() => {});
    throw err;
  }
}

export async function sendMessage(
  sandboxId: string,
  agentSessionId: string,
  message: string,
  onEvent: (event: AgentEvent) => void,
): Promise<AgentSession> {
  const { apiKey, apiUrl } = getConfig();

  const sandbox = await Sandbox.connect(sandboxId, { apiKey, apiUrl });
  const agentSession = await sandbox.agent.attach(agentSessionId, { onEvent });
  agentSession.sendPrompt(message);

  return agentSession;
}

export async function ensurePreviewUrl(sandboxId: string): Promise<string> {
  const { apiKey, apiUrl } = getConfig();
  const sandbox = await Sandbox.connect(sandboxId, { apiKey, apiUrl });

  const previews = await sandbox.listPreviewURLs();
  const existing = previews.find((p) => p.port === DEV_SERVER_PORT);
  if (existing) {
    return `https://${existing.hostname}`;
  }

  const preview = await sandbox.createPreviewURL({ port: DEV_SERVER_PORT });
  return `https://${preview.hostname}`;
}

export async function killSandbox(sandboxId: string): Promise<void> {
  const { apiKey, apiUrl } = getConfig();
  const sandbox = await Sandbox.connect(sandboxId, { apiKey, apiUrl });
  await sandbox.kill();
}

async function syncAgentConfig(sandbox: Sandbox): Promise<void> {
  // Sync skills directory into sandbox
  const skillsDir = path.join(AGENT_DIR, ".claude", "skills", "build-app");
  const skillPath = path.join(skillsDir, "SKILL.md");

  if (fs.existsSync(skillPath)) {
    const content = fs.readFileSync(skillPath, "utf-8");
    await sandbox.files.makeDir("/workspace/agent/.claude/skills/build-app");
    await sandbox.files.write(
      "/workspace/agent/.claude/skills/build-app/SKILL.md",
      content,
    );
  }
}
