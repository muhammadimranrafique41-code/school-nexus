
import pg from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function audit() {
  console.log("--- CLASS & USER AUDIT ---");
  try {
    const classes = await pool.query('SELECT id, grade, section, stream FROM classes');
    console.log("CLASSES:", JSON.stringify(classes.rows, null, 2));
    
    const students = await pool.query("SELECT id, name, class_name FROM users WHERE role = 'student' LIMIT 20");
    console.log("STUDENT CLASS NAMES:", JSON.stringify(students.rows, null, 2));

    const timetables = await pool.query('SELECT id, class_id, status FROM timetables');
    console.log("TIMETABLES:", JSON.stringify(timetables.rows, null, 2));

  } catch (err) {
    console.error("Audit error:", err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}
audit();
