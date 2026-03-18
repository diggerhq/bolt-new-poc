import type { Metadata } from "next";

import { BuilderShell } from "@/app/builder/builder-shell";
import { requireCurrentUser } from "@/lib/auth/auth";

export const metadata: Metadata = {
  title: "Builder",
};

interface BuilderSessionPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function BuilderSessionPage({ params }: BuilderSessionPageProps) {
  const user = await requireCurrentUser();
  const { sessionId } = await params;

  return <BuilderShell initialUser={user} initialSessionId={sessionId} />;
}
