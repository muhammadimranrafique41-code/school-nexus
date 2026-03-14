
import pg from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function audit() {
  console.log("--- DATABASE AUDIT ---");
  
  try {
    const settings = await pool.query('SELECT * FROM timetable_settings');
    console.log("TIMETABLE SETTINGS:", JSON.stringify(settings.rows, null, 2));
    
    const published = await pool.query("SELECT * FROM timetables WHERE status = 'published'");
    console.log("PUBLISHED TIMETABLES:", JSON.stringify(published.rows, null, 2));
    
    for (const tt of published.rows) {
      const periods = await pool.query('SELECT * FROM timetables_periods WHERE timetable_id = $1', [tt.id]);
      console.log(`PERIODS for Timetable ID ${tt.id}: count=${periods.rows.length}`);
      const sat = periods.rows.filter(p => p.day_of_week === 6);
      console.log(`SATURDAY PERIODS (day_of_week=6):`, JSON.stringify(sat, null, 2));
    }
    
    // Check school ID 1 specifically
    const schoolSettings = await pool.query('SELECT * FROM timetable_settings WHERE school_id = 1');
    if (schoolSettings.rows.length === 0) {
      console.log("No settings found for school_id=1. Falling back to defaults.");
    }

  } catch (err) {
    console.error("Audit error:", err);
  } finally {
    await pool.end();
    console.log("--- AUDIT COMPLETE ---");
    process.exit(0);
  }
}

audit();
