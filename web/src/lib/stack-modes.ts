export type AuthMode = "workos";
export type DatabaseMode = "stub" | "supabase";
export type SandboxMode = "stub" | "provider";

export interface StackModes {
  auth: AuthMode;
  database: DatabaseMode;
  sandbox: SandboxMode;
  sandboxProvider: string;
}

export function getStackModes(): StackModes {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const sandboxProvider = process.env.SANDBOX_PROVIDER ?? "stub";

  return {
    auth: "workos",
    database: supabaseConfigured ? "supabase" : "stub",
    sandbox: sandboxProvider === "stub" ? "stub" : "provider",
    sandboxProvider,
  };
}
