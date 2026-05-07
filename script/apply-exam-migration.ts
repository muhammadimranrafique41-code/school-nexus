/**
 * @file apply-exam-migration.ts
 * @description Manually apply the examination management migration
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_PREFIX = "[Apply Exam Migration]";

async function applyMigration(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(`${LOG_PREFIX} DATABASE_URL is not set.`);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  const db = drizzle(pool);

  console.log(`${LOG_PREFIX} Reading migration file...`);
  
  const migrationPath = resolve(__dirname, "../migrations/0020_examination_management.sql");
  const migrationSql = readFileSync(migrationPath, "utf-8");

  console.log(`${LOG_PREFIX} Applying examination management migration...`);

  try {
    // Execute the entire migration as a single transaction
    await db.execute(sql.raw(migrationSql));
    console.log(`${LOG_PREFIX} ✅ Migration applied successfully!`);
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

applyMigration().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${LOG_PREFIX} Fatal error: ${message}`);
  process.exit(1);
});
