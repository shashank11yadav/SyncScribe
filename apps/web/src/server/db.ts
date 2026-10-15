import "server-only";
import { createDb, type DbHandle } from "@syncscribe/db";
import { serverEnv } from "./env";

// Reuse one pool across hot reloads in development and across invocations
// of a warm serverless function in production.
const globalForDb = globalThis as unknown as { syncscribeDb?: DbHandle };

export function getDb() {
  globalForDb.syncscribeDb ??= createDb(serverEnv().DATABASE_URL, { max: 5 });
  return globalForDb.syncscribeDb.db;
}
