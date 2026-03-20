import { getCurrentUser } from "@/lib/auth";

function platformUrl(p: string) {
  return `${(process.env.PLATFORM_API_URL ?? "http://localhost:8081").replace(/\/+$/, "")}${p}`;
}
function apiKey() {
  return process.env.OPENCOMPUTER_API_KEY ?? "";
}

interface Params {
  params: Promise<{ sessionId: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await params;
  const resp = await fetch(platformUrl(`/v1/sessions/${sessionId}?user_id=${encodeURIComponent(user.id)}`), {
    headers: { "X-API-Key": apiKey() },
  });

  if (!resp.ok) return Response.json({ error: "Session not found." }, { status: 404 });

  const session = await resp.json();
  const eventsUrl = `${platformUrl(`/v1/sessions/${sessionId}/events`)}?api_key=${encodeURIComponent(apiKey())}`;

  return Response.json({ session, eventsUrl });
}
