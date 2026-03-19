import pg from 'pg';
import "dotenv/config";
import fs from 'fs';

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
  try {
    await client.connect();
    console.log("Connected to DB");
    
    // Check fees table columns and sample data
    const tableInfo = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'fees';
    `);
    
    const sampleData = await client.query(`
      SELECT id, amount, paid_amount, total_discount, remaining_balance, status 
      FROM fees 
      LIMIT 5;
    `);
    
    const output = {
      columns: tableInfo.rows,
      data: sampleData.rows
    };
    
    fs.writeFileSync('output.txt', JSON.stringify(output, null, 2));
    console.log("Success");
  } catch(e) {
    fs.writeFileSync('output.txt', 'Error: ' + e + '\n');
    console.error(e);
  } finally {
    await client.end();
    process.exit(0);
  }
}
main();
