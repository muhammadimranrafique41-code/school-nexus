/**
 * run-migration-0017.ts
 *
 * Executes migrations/0017_academic_sessions_and_promotion.sql directly
 * against the configured DATABASE_URL.  All statements use IF NOT EXISTS
 * so re-running is safe.
 *
 * Usage:
 *   npx tsx script/run-migration-0017.ts
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

// Load .env (fallback to .env.local)
dotenv.config();
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: ".env.local" });
}

import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATION_FILE = resolve(
  __dirname,
  "../migrations/0017_academic_sessions_and_promotion.sql"
);

const LOG_PREFIX = "[Migration 0017]";

async function run(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(`${LOG_PREFIX} DATABASE_URL is not set.`);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15_000,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();

  try {
    console.log(`${LOG_PREFIX} Reading: ${MIGRATION_FILE}`);
    const migrationSql = readFileSync(MIGRATION_FILE, "utf-8");

    // Remove block comments (/* ... */) first, then split on semicolons
    const stripped = migrationSql.replace(/\/\*[\s\S]*?\*\//g, "");

    // Split on semicolons, strip blank lines and pure-comment lines
    const statements = stripped
      .split(";")
      .map((s) => s.trim())
      .filter((s) => {
        if (!s) return false;
        // Skip lines that are only -- comments
        const nonComment = s.replace(/--[^\n]*/g, "").trim();
        return nonComment.length > 0;
      });

    console.log(`${LOG_PREFIX} Executing ${statements.length} statement(s)…`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.replace(/\s+/g, " ").slice(0, 100);
      console.log(`${LOG_PREFIX} [${i + 1}/${statements.length}] ${preview}…`);
      await client.query(stmt);
      console.log(`${LOG_PREFIX} ✓ OK`);
    }

    console.log(`\n${LOG_PREFIX} ✅ Migration 0017 applied successfully.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${LOG_PREFIX} ✗ FAILED: ${message}`);
  process.exit(1);
});
