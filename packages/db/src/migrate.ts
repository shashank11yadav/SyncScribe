import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./index";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const { db, sql } = createDb(url, { max: 1 });
try {
  // MIGRATIONS_DIR lets the bundled copy in the sync image point at its own folder.
  const migrationsFolder = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../migrations", import.meta.url));
  await migrate(db, { migrationsFolder });
  console.log("migrations applied");
} finally {
  await sql.end();
}
