import { Sandbox, type AgentSession, type AgentEvent } from "@opencomputer/sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_DIR = process.env.AGENT_DIR ?? path.resolve(__dirname, "..", "..", "..", "agent");
const SANDBOX_TIMEOUT = 3600;
const DEV_SERVER_PORT = 3000;

// Keep agent sessions alive so WebSocket stays open. Key: builder session ID.
const activeSessions = new Map<string, AgentSession>();

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
  builderSessionId: string,
  prompt: string,
  apiKey: string,
  onEvent: (event: AgentEvent) => void,
): Promise<SandboxHandle> {
  const apiUrl = process.env.OPENCOMPUTER_API_URL ?? "https://app.opencomputer.dev";
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is required");

  const sandbox = await Sandbox.create({
    apiKey,
    apiUrl,
    template: "base",
    timeout: SANDBOX_TIMEOUT,
    envs: { ANTHROPIC_API_KEY: anthropicApiKey },
  });

  try {
    await syncAgentConfig(sandbox);
    await sandbox.exec.run("mkdir -p /workspace/app", { timeout: 10 });

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

    activeSessions.set(builderSessionId, agentSession);
    agentSession.done.then(() => activeSessions.delete(builderSessionId));

    let previewUrl = "";
    try {
      const preview = await sandbox.createPreviewURL({ port: DEV_SERVER_PORT });
      previewUrl = `https://${preview.hostname}`;
    } catch {
      // dev server not up yet
    }

    return {
      sandboxId: sandbox.sandboxId,
      previewUrl,
      agentSessionId: agentSession.sessionId,
    };
  } catch (err) {
    await sandbox.kill().catch(() => {});
    throw err;
  }
}

export async function sendMessage(
  builderSessionId: string,
  sandboxId: string,
  agentSessionId: string,
  message: string,
  apiKey: string,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  let session = activeSessions.get(builderSessionId);

  if (!session) {
    const apiUrl = process.env.OPENCOMPUTER_API_URL ?? "https://app.opencomputer.dev";
    const sandbox = await Sandbox.connect(sandboxId, { apiKey, apiUrl });
    session = await sandbox.agent.attach(agentSessionId, {
      onEvent,
      onError: (data) => {
        console.error("[sandbox agent stderr]", data);
      },
    });
    activeSessions.set(builderSessionId, session);
    session.done.then(() => activeSessions.delete(builderSessionId));
  }

  session.sendPrompt(message);
}

export async function killSandbox(sandboxId: string, apiKey: string): Promise<void> {
  const apiUrl = process.env.OPENCOMPUTER_API_URL ?? "https://app.opencomputer.dev";
  const sandbox = await Sandbox.connect(sandboxId, { apiKey, apiUrl });
  await sandbox.kill();
}

async function syncAgentConfig(sandbox: Sandbox): Promise<void> {
  const skillPath = path.join(AGENT_DIR, ".claude", "skills", "build-app", "SKILL.md");
  if (fs.existsSync(skillPath)) {
    const content = fs.readFileSync(skillPath, "utf-8");
    await sandbox.files.makeDir("/workspace/agent/.claude/skills/build-app");
    await sandbox.files.write(
      "/workspace/agent/.claude/skills/build-app/SKILL.md",
      content,
    );
  }
}
