import { db } from "./server/db.ts";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Checking and adding columns to the database...");
  try {
    // 1. Check/Add fees columns
    console.log("Fixing 'fees' table...");
    await db.execute(sql`
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS paid_amount integer NOT NULL DEFAULT 0;
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS total_discount integer NOT NULL DEFAULT 0;
    `);
    console.log("Fees table updated (or already correct).");

    // 2. Check/Add fee_payments columns
    console.log("Fixing 'fee_payments' table...");
    await db.execute(sql`
      ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS discount integer DEFAULT 0;
      ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS discount_reason text;
    `);
    console.log("Fee payments table updated (or already correct).");

    console.log("DATABASE FIX SUCCESSFUL!");
  } catch (e) {
    console.error("DATABASE FIX FAILED:", e.message);
  } finally {
    process.exit(0);
  }
}

main();
