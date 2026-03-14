
import pg from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  console.log("--- DATA AUDIT ---");
  try {
    const res = await pool.query(`
      SELECT t.class_name, tp.*
      FROM timetables t
      JOIN timetables_periods tp ON t.id = tp.timetable_id
      WHERE t.status = 'published' AND tp.day_of_week = 6
    `);
    console.log("PUBLISHED SATURDAY PERIODS:", JSON.stringify(res.rows, null, 2));

    const res2 = await pool.query(`
      SELECT * FROM timetable WHERE day_of_week = 'Saturday' OR day_of_week = '6'
    `);
    console.log("FALLBACK SATURDAY PERIODS:", JSON.stringify(res2.rows, null, 2));

  } catch (err) {
    console.error("Audit error:", err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}
check();
