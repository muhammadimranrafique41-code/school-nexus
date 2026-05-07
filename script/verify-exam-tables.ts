/**
 * @file verify-exam-tables.ts
 * @description Verify that exam management tables exist
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import pg from "pg";

const { Pool } = pg;

const LOG_PREFIX = "[Verify Tables]";

async function verifyTables(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(`${LOG_PREFIX} DATABASE_URL is not set.`);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  const db = drizzle(pool);

  console.log(`${LOG_PREFIX} Checking for exam management tables...`);

  const tables = ["exam_sessions", "exam_subjects", "exam_marks", "exam_attendance", "grade_scales", "parent_wallets", "wallet_transactions"];

  for (const tableName of tables) {
    try {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
        );
      `);
      const exists = result.rows[0]?.exists;
      console.log(`${LOG_PREFIX} ${tableName}: ${exists ? '✓ EXISTS' : '✗ MISSING'}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${LOG_PREFIX} Error checking ${tableName}: ${message}`);
    }
  }

  await pool.end();
}

verifyTables().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${LOG_PREFIX} Fatal error: ${message}`);
  process.exit(1);
});
