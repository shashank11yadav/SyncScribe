import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDb } from "@syncscribe/db";
import { testDatabaseUrl } from "./env";

/** Creates the test database on first run and brings its schema up to date. */
export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const existing = await admin`select 1 from pg_database where datname = ${name}`;
    if (existing.length === 0) await admin.unsafe(`create database "${name.replace(/"/g, "")}"`);
  } finally {
    await admin.end();
  }

  const { db, sql } = createDb(url.toString(), { max: 1 });
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../packages/db/migrations", import.meta.url)),
    });
  } finally {
    await sql.end();
  }
}
