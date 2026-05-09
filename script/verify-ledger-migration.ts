import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import pg from "pg";

const { Client } = pg;

async function verify() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const result = await client.query(
    `SELECT table_name, table_type
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('ledger', 'cash_flow_summary')
     ORDER BY table_name`
  );

  console.log("Relations found in DB:");
  if (result.rows.length === 0) {
    console.log("  ⚠️  NONE — migration may not have been applied.");
  } else {
    result.rows.forEach((r) => console.log(`  ✓ ${r.table_name} (${r.table_type})`));
  }

  // Also verify ledger table columns
  const cols = await client.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_name = 'ledger'
     ORDER BY ordinal_position`
  );
  if (cols.rows.length > 0) {
    console.log("\nledger table columns:");
    cols.rows.forEach((c) => console.log(`  ${c.column_name}: ${c.data_type}`));
  }

  await client.end();
}

verify().catch((e) => { console.error(e); process.exit(1); });
