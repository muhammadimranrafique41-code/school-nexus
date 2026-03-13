import pg from 'pg';
import "dotenv/config";
import fs from 'fs';

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    await client.connect();
    fs.writeFileSync('output.txt', 'Connected to DB.\n');
    console.log("Connected");
    
    // We will cast fee_id from whatever it is to integer using USING clause
    const res = await client.query(`
      ALTER TABLE finance_vouchers ALTER COLUMN fee_id TYPE integer USING fee_id::integer;
    `);
    
    fs.appendFileSync('output.txt', 'Query success: ' + JSON.stringify(res) + '\n');
    console.log("Success");
  } catch(e) {
    fs.appendFileSync('output.txt', 'Error: ' + e + '\n');
    console.error(e);
  } finally {
    await client.end();
    process.exit(0);
  }
}
main();
