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

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return Response.json({ error: "Message is required." }, { status: 400 });

  const { sessionId } = await params;
  const resp = await fetch(platformUrl(`/v1/sessions/${sessionId}/messages`), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey() },
    body: JSON.stringify({ message, user_id: user.id }),
  });

  if (!resp.ok) return Response.json({ error: "Session not found." }, { status: 404 });

  const session = await resp.json();
  return Response.json({ session });
}
