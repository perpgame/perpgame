import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const client = postgres(url, { max: 1 });
const db = drizzle(client);

// If __drizzle_migrations is empty the DB was set up manually (migrations 0000-0004
// were applied outside of Drizzle). Seed the table so Drizzle won't try to re-run them.
try {
  const rows = await client`SELECT COUNT(*)::int AS count FROM drizzle.__drizzle_migrations`;
  if (rows[0].count === 0) {
    // Record migration 0004 as the last applied so Drizzle picks up from 0005 onward.
    const content = readFileSync("./db/migrations/0004_indexes.sql").toString();
    const hash = createHash("sha256").update(content).digest("hex");
    const when = 1775028302691; // folderMillis of 0004 in the journal
    await client`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${hash}, ${when})`;
    console.log("Seeded migration history: marked 0000-0004 as already applied");
  }
} catch (err) {
  // Table may not exist yet on a brand-new DB — that's fine, migrate() will create it.
  if (!err.message?.includes("drizzle.__drizzle_migrations")) throw err;
}

await migrate(db, { migrationsFolder: "./db/migrations" });
console.log("Migrations complete");
await client.end();
