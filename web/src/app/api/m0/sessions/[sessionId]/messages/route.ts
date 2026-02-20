import { getCurrentUser } from "@/lib/auth/auth";
import { appendSessionMessage, getSession } from "@/lib/builder/mock-store";

interface SessionMessagesRouteParams {
  params: Promise<{
    sessionId: string;
  }>;
}

interface AppendMessageBody {
  message?: unknown;
}

export async function POST(
  request: Request,
  { params }: SessionMessagesRouteParams,
) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as AppendMessageBody;
  const message = typeof body.message === "string" ? body.message : "";

  if (message.trim().length === 0) {
    return Response.json(
      { error: "Message is required for iteration." },
      { status: 400 },
    );
  }

  const { sessionId } = await params;
  const session = getSession(sessionId);

  if (!session || session.userId !== user.id) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  const updatedSession = appendSessionMessage({
    sessionId,
    message,
  });

  if (!updatedSession) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  return Response.json({ session: updatedSession });
}
