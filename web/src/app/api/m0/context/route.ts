import { getCurrentUser } from "@/lib/auth/auth";
import { getStackModes } from "@/lib/stack-modes";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({
    user,
    stackModes: getStackModes(),
  });
}
