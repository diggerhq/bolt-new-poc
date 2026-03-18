import { getCurrentUser } from "@/lib/auth/auth";
import { getEventsUrl } from "@/lib/platform-client";

interface EventsRouteParams {
  params: Promise<{ sessionId: string }>;
}

// Client should connect directly to the platform API SSE endpoint.
// This route returns the URL to connect to.
export async function GET(
  _request: Request,
  { params }: EventsRouteParams,
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  return Response.json({ url: getEventsUrl(sessionId) });
}
