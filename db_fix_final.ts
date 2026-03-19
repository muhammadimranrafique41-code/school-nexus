import pg from 'pg';
import "dotenv/config";

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
  console.log("Connecting to Database...");
  try {
    await client.connect();
    console.log("Connected Successfully.");

    // 1. Check and add columns to 'fees'
    console.log("\nVerifying 'fees' table columns...");
    await client.query(`
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS paid_amount integer NOT NULL DEFAULT 0;
    `);
    console.log("- 'paid_amount' verified/added.");

    await client.query(`
      ALTER TABLE fees ADD COLUMN IF NOT EXISTS total_discount integer NOT NULL DEFAULT 0;
    `);
    console.log("- 'total_discount' verified/added.");

    // 2. Check and add columns to 'fee_payments'
    console.log("\nVerifying 'fee_payments' table columns...");
    await client.query(`
      ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS discount integer NOT NULL DEFAULT 0;
    `);
    console.log("- 'discount' verified/added.");

    await client.query(`
      ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS discount_reason text;
    `);
    console.log("- 'discount_reason' verified/added.");

    // 3. Optional: Recalculate remaining_balance if needed
    // This is just to ensure existing data is consistent
    console.log("\nUpdating remaining_balance for existing records...");
    await client.query(`
      UPDATE fees 
      SET remaining_balance = GREATEST(amount - paid_amount - total_discount, 0);
    `);
    console.log("- 'remaining_balance' recalculated for all fees.");

    console.log("\nDATABASE FIX COMPLETED SUCCESSFULLY!");

  } catch (e) {
    console.error("\nDATABASE FIX FAILED:");
    console.error(e.message);
  } finally {
    await client.end();
    process.exit(0);
  }
}

main();
