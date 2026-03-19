import pg from 'pg';
import "dotenv/config";

const client = new pg.Client({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log("Connecting to DB...");
  try {
    await client.connect();
    console.log("Connected to DB.");

    const feeId = 18; 

    console.log(`\n--- Inspecting Fee #${feeId} ---`);
    const feeRes = await client.query('SELECT * FROM fees WHERE id = $1', [feeId]);
    console.log("Fee Record:", JSON.stringify(feeRes.rows[0], null, 2));

    console.log(`\n--- Inspecting Payments for Fee #${feeId} ---`);
    const payRes = await client.query('SELECT * FROM fee_payments WHERE fee_id = $1', [feeId]);
    console.log("Payments:", JSON.stringify(payRes.rows, null, 2));

    console.log(`\n--- Column Check ---`);
    const colsRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'fees' AND column_name IN ('paid_amount', 'total_discount', 'remaining_balance')
    `);
    console.log("Fees Columns:", JSON.stringify(colsRes.rows, null, 2));

  } catch (e) {
    console.error("Error during inspection:", e.message);
  } finally {
    await client.end();
  }
}

main();
