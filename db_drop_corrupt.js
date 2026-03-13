import pg from 'pg';
import "dotenv/config";

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to Neon DB.");

    await client.query("DROP TABLE IF EXISTS finance_vouchers CASCADE;");
    console.log("Dropped finance_vouchers table.");

    await client.query("DROP TABLE IF EXISTS finance_voucher_operations CASCADE;");
    console.log("Dropped finance_voucher_operations table.");

    console.log("Cleanup complete. Ready for drizzle-kit push.");
  } catch(e) {
    console.error("Error executing queries:", e);
  } finally {
    await client.end();
    process.exit(0);
  }
}

run();
