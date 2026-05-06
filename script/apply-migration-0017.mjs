/**
 * apply-migration-0017.mjs
 * Run with: node script/apply-migration-0017.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env manually
const envPath = resolve(__dirname, "../.env");
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // ignore if .env not found
}

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL not set");
  process.exit(1);
}

console.log("Connecting to database...");
const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("Connected.");

  // 1. academic_sessions table
  console.log("\n[1/6] Creating academic_sessions table...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS "academic_sessions" (
      "id"         SERIAL PRIMARY KEY,
      "name"       TEXT NOT NULL,
      "start_date" DATE NOT NULL,
      "end_date"   DATE NOT NULL,
      "is_current" BOOLEAN NOT NULL DEFAULT false,
      "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
      "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
      CONSTRAINT "academic_sessions_name_unique" UNIQUE ("name"),
      CONSTRAINT "academic_sessions_dates_check" CHECK ("end_date" > "start_date")
    )
  `);
  console.log("  ✓ academic_sessions table OK");

  // 2. Partial unique index
  console.log("[2/6] Creating partial unique index for is_current...");
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "academic_sessions_single_current_idx"
      ON "academic_sessions" ("is_current")
      WHERE "is_current" = true
  `);
  console.log("  ✓ Index OK");

  // 3. promotion_history table
  console.log("[3/6] Creating promotion_history table...");
  await client.query(`
    CREATE TABLE IF NOT EXISTS "promotion_history" (
      "id"                   SERIAL PRIMARY KEY,
      "student_id"           INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "from_class_id"        INTEGER REFERENCES "classes"("id") ON DELETE SET NULL,
      "to_class_id"          INTEGER NOT NULL REFERENCES "classes"("id") ON DELETE RESTRICT,
      "academic_session_id"  INTEGER REFERENCES "academic_sessions"("id") ON DELETE SET NULL,
      "promoted_by"          INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
      "notes"                TEXT,
      "promotion_date"       DATE NOT NULL DEFAULT CURRENT_DATE,
      "created_at"           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
    )
  `);
  console.log("  ✓ promotion_history table OK");

  // 4-6. Indexes
  console.log("[4/6] Creating promotion_history_student_idx...");
  await client.query(`
    CREATE INDEX IF NOT EXISTS "promotion_history_student_idx"
      ON "promotion_history" ("student_id")
  `);
  console.log("  ✓ OK");

  console.log("[5/6] Creating promotion_history_session_idx...");
  await client.query(`
    CREATE INDEX IF NOT EXISTS "promotion_history_session_idx"
      ON "promotion_history" ("academic_session_id")
  `);
  console.log("  ✓ OK");

  console.log("[6/6] Creating promotion_history_to_class_idx...");
  await client.query(`
    CREATE INDEX IF NOT EXISTS "promotion_history_to_class_idx"
      ON "promotion_history" ("to_class_id")
  `);
  console.log("  ✓ OK");

  // Verify tables exist
  console.log("\nVerifying tables...");
  const result = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('academic_sessions', 'promotion_history')
    ORDER BY table_name
  `);
  console.log("Tables found:", result.rows.map((r) => r.table_name).join(", "));

  console.log("\n✅ Migration 0017 applied successfully!");
} catch (err) {
  console.error("✗ FAILED:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
