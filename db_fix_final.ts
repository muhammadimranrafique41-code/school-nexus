import pg from 'pg';
import "dotenv/config";

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

import fs from 'fs';

const logFile = 'db_log.txt';
function logT(msg: string) {
  console.log(msg);
  fs.appendFileSync(logFile, `${new Date().toLocaleTimeString()} - ${msg}\n`);
}

async function main() {
  if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
  logT("Connecting to Database...");
  try {
    await client.connect();
    logT("Connected Successfully.");

    // 1. Check and add columns to 'fees'
    logT("\nVerifying 'fees' table columns...");
    await client.query(`
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS paid_amount integer NOT NULL DEFAULT 0;
    `);
    logT("- 'paid_amount' verified/added.");

    await client.query(`
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS total_discount integer NOT NULL DEFAULT 0;
    `);
    logT("- 'total_discount' verified/added.");

    // 2. Check and add columns to 'fee_payments'
    logT("\nVerifying 'fee_payments' table columns...");
    await client.query(`
      ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS discount integer NOT NULL DEFAULT 0;
    `);
    logT("- 'discount' verified/added.");

    await client.query(`
      ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS discount_reason text;
    `);
    logT("- 'discount_reason' verified/added.");

    // 3. Optional: Recalculate remaining_balance if needed
    // This is just to ensure existing data is consistent
    logT("\nUpdating remaining_balance for existing records...");
    await client.query(`
      UPDATE fees 
      SET remaining_balance = GREATEST(amount - paid_amount - total_discount, 0);
    `);
    logT("- 'remaining_balance' recalculated for all fees.");

    logT("\nDATABASE FIX COMPLETED SUCCESSFULLY!");

  } catch (e: any) {
    logT("\nDATABASE FIX FAILED:");
    logT(e.message);
  } finally {
    await client.end();
    process.exit(0);
  }
}

main();
