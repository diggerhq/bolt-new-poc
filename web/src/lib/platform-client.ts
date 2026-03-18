import "server-only";

function getConfig() {
  const baseUrl = (process.env.PLATFORM_API_URL ?? "http://localhost:8081").replace(/\/+$/, "");
  const apiKey = process.env.OPENCOMPUTER_API_KEY ?? "";
  if (!apiKey) throw new Error("OPENCOMPUTER_API_KEY is required");
  return { baseUrl, apiKey };
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
