import { getCurrentUser } from "@/lib/auth/auth";
import { getSession } from "@/lib/builder/mock-store";

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
  const session = getSession(sessionId);

  if (!session || session.userId !== user.id) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  return Response.json({ session });
}
