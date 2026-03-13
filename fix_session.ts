import { pool } from "./server/db.js";

async function fixSessionTable() {
  const client = await pool.connect();
  try {
    // Check current type of expire column
    const { rows: cols } = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'session' AND column_name = 'expire';
    `);
    console.log("Current expire column type:", cols);

    if (cols.length > 0 && cols[0].data_type !== 'timestamp with time zone') {
      console.log("Altering expire column from TEXT to TIMESTAMPTZ...");
      await client.query(`
        ALTER TABLE session 
        ALTER COLUMN expire TYPE TIMESTAMPTZ 
        USING expire::TIMESTAMPTZ;
      `);
      console.log("SUCCESS: expire column is now TIMESTAMPTZ.");
    } else if (cols.length > 0) {
      console.log("expire column is already TIMESTAMPTZ. No change needed.");
    } else {
      console.log("expire column not found in session table.");
    }
  } catch (e) {
    console.error("FAILED:", e.message);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

fixSessionTable();
