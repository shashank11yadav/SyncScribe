import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const envFile = fileURLToPath(new URL("../.env", import.meta.url));

/** Integration tests run against a real Postgres, never the dev database. */
export function testDatabaseUrl(): string {
  if (!process.env.TEST_DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set. Copy .env.example to .env.");
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error("TEST_DATABASE_URL must name a database containing 'test'; refusing to run against it.");
  }
  return url;
}

export const TEST_SYNC_SECRET = "integration-test-secret-0123456789-abcdefghijklmnop";
