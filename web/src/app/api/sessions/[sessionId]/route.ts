import { getCurrentUser } from "@/lib/auth/auth";
import { getSession } from "@/lib/platform-client";

interface SessionRouteParams {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function GET(_request: Request, { params }: SessionRouteParams) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const session = await getSession(sessionId, user.id);

  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  return Response.json({ session });
}
