
import pg from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fix() {
  console.log("--- DATABASE FIX ---");
  try {
    // Force Saturday and 8 periods for EVERY school record found
    const res = await pool.query(`
      UPDATE timetable_settings 
      SET working_days = '[1, 2, 3, 4, 5, 6]', 
          total_periods = 8,
          updated_at = NOW()
    `);
    console.log(`Updated ${res.rowCount} settings record(s).`);
    
    // Also ensure the published timetable periods are correctly indexed if any exist
    // Just a check for now
    const periods = await pool.query('SELECT DISTINCT day_of_week FROM timetables_periods');
    console.log("Day indices currently in database:", periods.rows.map(r => r.day_of_week));

  } catch (err) {
    console.error("Fix error:", err);
  } finally {
    await pool.end();
    console.log("--- FIX COMPLETE ---");
    process.exit(0);
  }
}

fix();
