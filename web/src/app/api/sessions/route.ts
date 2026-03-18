import { getCurrentUser } from "@/lib/auth/auth";
import { createSession, getEventsUrl } from "@/lib/platform-client";
import { getStackModes } from "@/lib/stack-modes";

interface CreateSessionBody {
  prompt?: unknown;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CreateSessionBody;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";

  if (prompt.trim().length === 0) {
    return Response.json(
      { error: "Prompt is required to start a session." },
      { status: 400 },
    );
  }

  const session = await createSession(prompt, user);

  return Response.json({
    session,
    eventsUrl: getEventsUrl(session.id),
    stackModes: getStackModes(),
  });
}
