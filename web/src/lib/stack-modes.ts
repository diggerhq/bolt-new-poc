export type AuthMode = "workos";
export type DatabaseMode = "supabase";
export type SandboxMode = "stub" | "provider";

export interface StackModes {
  auth: AuthMode;
  database: DatabaseMode;
  sandbox: SandboxMode;
  sandboxProvider: string;
}

export function getStackModes(): StackModes {
  const sandboxProvider = process.env.SANDBOX_PROVIDER ?? "stub";

  return {
    auth: "workos",
    database: "supabase",
    sandbox: sandboxProvider === "stub" ? "stub" : "provider",
    sandboxProvider,
  };
}
