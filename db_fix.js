import pg from 'pg';
import "dotenv/config";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  console.log("Connected. Altering expire column...");
  try {
    await client.query(`
      ALTER TABLE session 
      ALTER COLUMN expire TYPE TIMESTAMPTZ 
      USING expire::TIMESTAMPTZ;
    `);
    console.log("SUCCESS: expire column is now TIMESTAMPTZ.");
  } catch (e) {
    console.error("FAILED:", e.message);
  } finally {
    await client.end();
    process.exit(0);
  }
}
main();
