import pg from 'pg';
import "dotenv/config";
import fs from 'fs';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const tableRes = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'fees';
  `);
  
  const dataRes = await client.query(`
    SELECT id, amount, paid_amount, total_discount, remaining_balance, status 
    FROM fees 
    ORDER BY id DESC
    LIMIT 10;
  `);

  fs.writeFileSync('output.json', JSON.stringify({
    columns: tableRes.rows,
    data: dataRes.rows
  }, null, 2));
  await client.end();
}
main();
