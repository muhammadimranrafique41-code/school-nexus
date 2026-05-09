/**
 * @file run-migration-0022.ts
 * @description Applies migration 0022 (ledger table + cash_flow_summary view)
 * to the live database using a raw pg client.
 *
 * Usage:
 *   npx tsx script/run-migration-0022.ts
 *
 * All DDL statements use IF NOT EXISTS / CREATE OR REPLACE so re-running is safe.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATION_FILE = resolve(__dirname, "../migrations/0022_ledger_table.sql");
const LOG_PREFIX = "[Migration 0022]";

async function run(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(`${LOG_PREFIX} DATABASE_URL is not set. Ensure .env.local is present.`);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15_000,
  });

  await client.connect();
  console.log(`${LOG_PREFIX} Connected to database.`);

  console.log(`${LOG_PREFIX} Reading: ${MIGRATION_FILE}`);
  const raw = readFileSync(MIGRATION_FILE, "utf-8");

  // Execute the entire file as a single query — pg handles multi-statement SQL
  // natively, so we don't need to split on semicolons at all.
  console.log(`${LOG_PREFIX} Executing migration SQL…\n`);

  try {
    await client.query(raw);
    console.log(`${LOG_PREFIX} ✅ Migration 0022 applied successfully.`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} ✗ FAILED: ${msg}`);
    await client.end();
    process.exit(1);
  }

  await client.end();
}

run().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`${LOG_PREFIX} Fatal: ${msg}`);
  process.exit(1);
});
