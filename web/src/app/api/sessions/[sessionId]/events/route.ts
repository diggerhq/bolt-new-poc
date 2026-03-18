import { getCurrentUser } from "@/lib/auth/auth";
import { getBuilderSession } from "@/lib/builder/store";
import { subscribe } from "@/lib/sandbox/event-bridge";

interface EventsRouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function GET(
  _request: Request,
  { params }: EventsRouteParams,
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const session = await getBuilderSession(sessionId, user.id);
  if (!session) {
    return Response.json({ error: "Session not found." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send initial keepalive
      controller.enqueue(encoder.encode(": connected\n\n"));

      const unsubscribe = subscribe(sessionId, (event) => {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });

      // Cleanup when client disconnects
      const interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(interval);
          unsubscribe();
        }
      }, 15_000);

      // Handle abort
      _request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
