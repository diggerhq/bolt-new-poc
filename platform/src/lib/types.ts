export type TraceLevel = "info" | "warning" | "error";
export type TraceType = string;
export type ChatRole = "user" | "assistant" | "system";

export interface TraceEvent {
  id: string;
  type: TraceType;
  level: TraceLevel;
  message: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ProjectArtifact {
  path: string;
  summary: string;
}

export interface ProjectSnapshot {
  title: string;
  framework: string;
  artifacts: ProjectArtifact[];
}

export interface BuilderSession {
  id: string;
  userId: string;
  previewUrl: string;
  createdAt: string;
  updatedAt: string;
  status: "ready" | "running" | "error";
  sandboxId: string | null;
  project: ProjectSnapshot;
  messages: ChatMessage[];
  events: TraceEvent[];
}
