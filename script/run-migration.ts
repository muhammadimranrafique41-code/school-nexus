/**
 * @file run-migration.ts
 * @description One-time migration runner for the Student History schema.
 *
 * Usage:
 *   npx tsx script/run-migration.ts
 *
 * The script reads `server/migrations/20250601_add_student_history_schema.sql`
 * and executes it against the configured DATABASE_URL using Drizzle's
 * `db.execute()`.  It is idempotent — every DDL statement uses
 * `CREATE … IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, so re-running is safe.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATION_FILE = resolve(
  __dirname,
  "../server/migrations/20250601_add_student_history_schema.sql"
);

const LOG_PREFIX = "[Migration Runner]";

async function runMigration(): Promise<void> {
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

  console.log(`${LOG_PREFIX} Reading migration file: ${MIGRATION_FILE}`);
  const migrationSql = readFileSync(MIGRATION_FILE, "utf-8");

  // Split on statement boundaries (semicolons) and filter blanks/comments
  const statements = migrationSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  console.log(
    `${LOG_PREFIX} Executing ${statements.length} SQL statement(s)…`
  );

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.slice(0, 80).replace(/\s+/g, " ");
    console.log(`${LOG_PREFIX} [${i + 1}/${statements.length}] ${preview}…`);

    try {
      await db.execute(sql.raw(stmt));
      console.log(`${LOG_PREFIX} ✓ Statement ${i + 1} succeeded.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `${LOG_PREFIX} ✗ Statement ${i + 1} failed: ${message}`
      );
      await pool.end();
      process.exit(1);
    }
  }

  console.log(`${LOG_PREFIX} ✅ Migration completed successfully.`);
  await pool.end();
}

runMigration().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${LOG_PREFIX} Fatal error: ${message}`);
  process.exit(1);
});
