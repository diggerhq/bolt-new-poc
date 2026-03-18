import pg from "pg";

let pool: pg.Pool | null = null;

export function getDbPool(): pg.Pool {
  if (pool) return pool;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const url = new URL(databaseUrl);
  const sslParam = url.searchParams.get("sslmode");

  let ssl: boolean | { rejectUnauthorized: boolean } | undefined;
  if (sslParam === "disable") {
    ssl = false;
  } else if (sslParam === "no-verify") {
    ssl = { rejectUnauthorized: false };
  } else if (databaseUrl.includes("supabase")) {
    ssl = { rejectUnauthorized: false };
  }

  pool = new pg.Pool({ connectionString: databaseUrl, ssl });
  return pool;
}

export async function runInTransaction<T>(
  runner: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getDbPool().connect();
  try {
    await client.query("begin");
    const result = await runner(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
