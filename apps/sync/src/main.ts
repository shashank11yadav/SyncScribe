import { createDb } from "@syncscribe/db";
import { loadConfig } from "./config";
import { log } from "./log";
import { createSyncServer } from "./server";

const config = loadConfig();
const database = createDb(config.DATABASE_URL, { max: 5 });
const { server } = createSyncServer({ config, database });

await server.listen();
log("info", "sync server listening", { port: config.PORT, origins: config.ALLOWED_ORIGINS });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log("info", "shutting down", { signal });
  // Flush debounced writes so the last few seconds of typing are not lost on deploy.
  server.hocuspocus.flushPendingStores();
  await server.destroy();
  await database.sql.end({ timeout: 5 });
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
