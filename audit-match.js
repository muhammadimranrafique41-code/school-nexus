
import pg from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function audit() {
  console.log("--- CLASS & USER MATCHING AUDIT ---");
  try {
    const classes = await pool.query('SELECT id, grade, section, stream FROM classes');
    console.log("CLASSES TABLE:");
    for (const c of classes.rows) {
      console.log(`- ID: ${c.id}, Name: ${c.grade}-${c.section}${c.stream ? `-${c.stream}` : ""}`);
    }
    
    const students = await pool.query("SELECT id, name, class_name FROM users WHERE role = 'student'");
    console.log("\nSTUDENTS IN USERS TABLE:");
    for (const s of students.rows) {
        console.log(`- ID: ${s.id}, Name: ${s.name}, Assigned Class: "${s.class_name}"`);
    }

    const timetables = await pool.query(`
      SELECT t.id, t.class_id, t.status, c.grade, c.section 
      FROM timetables t 
      JOIN classes c ON t.class_id = c.id
    `);
    console.log("\nTIMETABLES IN DB:");
    for (const t of timetables.rows) {
        console.log(`- ID: ${t.id}, ClassID: ${t.class_id} (${t.grade}-${t.section}), Status: ${t.status}`);
    }

  } catch (err) {
    console.error("Audit error:", err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}
audit();
