import "server-only";

import { Pool, type PoolClient } from "pg";

let cachedPool: Pool | null = null;

function getDatabaseUrlOrThrow(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for server-side persistence.");
  }

  return databaseUrl;
}

function resolveSslConfig(
  databaseUrl: string,
): { rejectUnauthorized: boolean } | boolean | undefined {
  try {
    const parsed = new URL(databaseUrl);
    const sslMode = parsed.searchParams.get("sslmode");

    if (sslMode === "disable") {
      return false;
    }

    if (sslMode === "require" || parsed.hostname.endsWith(".supabase.co")) {
      return { rejectUnauthorized: false };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function getDbPool(): Pool {
  if (cachedPool) {
    return cachedPool;
  }

  const connectionString = getDatabaseUrlOrThrow();
  const ssl = resolveSslConfig(connectionString);

  cachedPool = new Pool({
    connectionString,
    ...(ssl !== undefined ? { ssl } : {}),
  });

  return cachedPool;
}

export async function runInTransaction<T>(
  runner: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const result = await runner(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
