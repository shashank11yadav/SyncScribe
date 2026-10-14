import { sql as rawSql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export type Database = PostgresJsDatabase<typeof schema>;

/** Channel the web app notifies when a document's access list changes. */
export const ACCESS_CHANNEL = "syncscribe_access";

export interface DbHandle {
  db: Database;
  sql: postgres.Sql;
}

export function createDb(url: string, options: { max?: number } = {}): DbHandle {
  const sql = postgres(url, {
    max: options.max ?? 5,
    // Neon and most hosted Postgres close idle sockets; recycle before they do.
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    onnotice: () => {},
  });
  return { db: drizzle(sql, { schema }), sql };
}

/**
 * Tell the sync server that membership for a document changed so it can drop
 * open connections. Clients reconnect, ask the web app for a fresh token, and
 * get whatever access they have now.
 */
export async function notifyAccessChanged(db: Database, documentId: string): Promise<void> {
  await db.execute(rawSql`select pg_notify(${ACCESS_CHANNEL}, ${documentId})`);
}
