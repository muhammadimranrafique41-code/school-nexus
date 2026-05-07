/**
 * @file apply-missing-migrations.ts
 * @description Apply missing migrations 0019 and 0020 to the database
 *
 * Usage:
 *   npx tsx script/apply-missing-migrations.ts
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

const LOG_PREFIX = "[Apply Missing Migrations]";

const MIGRATIONS = [
  {
    file: "0019_wallet_system.sql",
    tag: "0019_wallet_system",
  },
  {
    file: "0020_examination_management.sql",
    tag: "0020_examination_management",
  },
];

async function applyMigrations(): Promise<void> {
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

  for (const migration of MIGRATIONS) {
    const migrationPath = resolve(__dirname, `../migrations/${migration.file}`);
    
    console.log(`\n${LOG_PREFIX} ========================================`);
    console.log(`${LOG_PREFIX} Applying: ${migration.file}`);
    console.log(`${LOG_PREFIX} ========================================`);
    
    try {
      const migrationSql = readFileSync(migrationPath, "utf-8");
      
      // Split on statement boundaries (semicolons) and filter blanks/comments
      // Handle multi-line statements properly
      const statements = migrationSql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => {
          // Filter out empty statements
          if (s.length === 0) return false;
          // Filter out pure comment lines
          if (s.startsWith("--")) return false;
          // Keep statements that have actual SQL (even if they have comments)
          const withoutComments = s.split('\n').filter(line => !line.trim().startsWith('--')).join('\n').trim();
          return withoutComments.length > 0;
        });

      console.log(
        `${LOG_PREFIX} Executing ${statements.length} SQL statement(s)...`
      );

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        const preview = stmt.slice(0, 80).replace(/\s+/g, " ");
        console.log(`${LOG_PREFIX} [${i + 1}/${statements.length}] ${preview}...`);

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

      console.log(`${LOG_PREFIX} ✅ ${migration.file} applied successfully.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${LOG_PREFIX} ✗ Failed to read or apply ${migration.file}: ${message}`);
      await pool.end();
      process.exit(1);
    }
  }

  console.log(`\n${LOG_PREFIX} ========================================`);
  console.log(`${LOG_PREFIX} ✅ All migrations completed successfully!`);
  console.log(`${LOG_PREFIX} ========================================`);
  await pool.end();
}

applyMigrations().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${LOG_PREFIX} Fatal error: ${message}`);
  process.exit(1);
});
