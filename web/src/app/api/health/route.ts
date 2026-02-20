import { getCurrentUser } from "@/lib/auth/auth";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ status: "ok" });
}
