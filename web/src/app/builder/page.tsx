import type { Metadata } from "next";

import { BuilderShell } from "@/app/builder/builder-shell";
import { requireCurrentUser } from "@/lib/auth/auth";
import { getStackModes } from "@/lib/stack-modes";

export const metadata: Metadata = {
  title: "Builder",
};

export default async function BuilderPage() {
  const user = await requireCurrentUser();

  return <BuilderShell initialUser={user} initialStackModes={getStackModes()} />;
}
