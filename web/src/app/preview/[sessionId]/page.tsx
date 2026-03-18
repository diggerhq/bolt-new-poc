import { notFound } from "next/navigation";

import { requireCurrentUser } from "@/lib/auth/auth";
import { getSession } from "@/lib/platform-client";

interface PreviewPageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export default async function PreviewPage({ params }: PreviewPageProps) {
  const user = await requireCurrentUser();

  const { sessionId } = await params;
  const session = await getSession(sessionId, user.id);

  if (!session) {
    notFound();
  }

  const latestAssistantMessage = [...session.messages]
    .reverse()
    .find((message) => message.role === "assistant");

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-slate-100">
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-700/70 bg-slate-900 p-5 shadow-2xl">
        <p className="text-xs tracking-wide text-cyan-200 uppercase">
          Stub Preview Surface
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {session.project.title}
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          Framework: <strong>{session.project.framework}</strong>
        </p>

        <section className="mt-5 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-cyan-100">Generated Files</h2>
          <ul className="mt-2 space-y-2 text-sm text-slate-200">
            {session.project.artifacts.map((artifact: { path: string; summary: string }) => (
              <li key={artifact.path} className="rounded-md bg-slate-900 p-2">
                <p className="font-mono text-xs text-cyan-200">{artifact.path}</p>
                <p className="mt-1 text-sm text-slate-300">{artifact.summary}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-5 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
          <h2 className="text-sm font-semibold text-cyan-100">
            Latest Agent Update
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
            {latestAssistantMessage?.content ?? "No assistant update yet."}
          </p>
        </section>
      </section>
    </main>
  );
}
