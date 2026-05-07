/**
 * @file run-migration-0019.ts
 * @description Runs migrations/0019_wallet_system.sql against the configured DATABASE_URL.
 *
 * Usage:
 *   npx tsx script/run-migration-0019.ts
 *
 * The migration is idempotent — every DDL uses CREATE … IF NOT EXISTS and
 * INSERT … ON CONFLICT DO NOTHING, so re-running is safe.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

// Load .env (falls back gracefully if .env.local is absent)
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });

import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATION_FILE = resolve(__dirname, "../migrations/0019_wallet_system.sql");
const LOG = "[Migration 0019]";

async function run(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(`${LOG} DATABASE_URL is not set. Ensure .env is present.`);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15_000,
  });

  const client = await pool.connect();

  try {
    console.log(`${LOG} Reading: ${MIGRATION_FILE}`);
    const migrationSql = readFileSync(MIGRATION_FILE, "utf-8");

    // Execute the entire file as a single transaction
    console.log(`${LOG} Executing migration inside a transaction…`);
    await client.query("BEGIN");

    try {
      await client.query(migrationSql);
      await client.query("COMMIT");
      console.log(`${LOG} ✅ Migration 0019 applied successfully.`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${LOG} ✗ Fatal error: ${message}`);
  process.exit(1);
});
