import type { StackModes } from "@/lib/stack-modes";

export type TraceLevel = "info" | "warning" | "error";
export type TraceType =
  | "session_started"
  | "planning"
  | "files_generated"
  | "dev_server_started"
  | "preview_ready"
  | "message_received"
  | "agent_response";

export interface TraceEvent {
  id: string;
  type: TraceType;
  level: TraceLevel;
  message: string;
  createdAt: string;
}

export type ChatRole = "user" | "assistant" | "system";

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
  project: ProjectSnapshot;
  messages: ChatMessage[];
  events: TraceEvent[];
}

export interface CreateSessionInput {
  prompt: string;
  userId: string;
}

export interface AppendMessageInput {
  sessionId: string;
  message: string;
}

export interface BuilderContextResponse {
  stackModes: StackModes;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

