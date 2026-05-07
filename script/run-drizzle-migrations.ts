/**
 * @file run-drizzle-migrations.ts
 * @description Apply pending Drizzle migrations
 *
 * Usage:
 *   npx tsx script/run-drizzle-migrations.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Pool } = pg;

const LOG_PREFIX = "[Drizzle Migrations]";

async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      `${LOG_PREFIX} DATABASE_URL is not set. Ensure .env.local is present.`
    );
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  const db = drizzle(pool);

  console.log(`${LOG_PREFIX} Starting migration process...`);

  try {
    await migrate(db, { migrationsFolder: "./migrations" });
    console.log(`${LOG_PREFIX} ✅ All migrations completed successfully!`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} ✗ Migration failed: ${message}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    await pool.end();
    process.exit(1);
  }

  await pool.end();
}

runMigrations().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${LOG_PREFIX} Fatal error: ${message}`);
  process.exit(1);
});
