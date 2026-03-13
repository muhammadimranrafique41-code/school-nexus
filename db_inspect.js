import pg from 'pg';
import "dotenv/config";
import fs from 'fs';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'finance_vouchers';
  `);
  fs.writeFileSync('output.json', JSON.stringify(res.rows, null, 2));
  await client.end();
}
main();
