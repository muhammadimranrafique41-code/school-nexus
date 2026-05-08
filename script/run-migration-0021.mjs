import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString:
    "postgresql://neondb_owner:npg_Ac8DEFyb9khK@ep-lively-hall-a1iw1xjc-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Step 1: Deduplicate classes — keep the row with the highest current_count (id DESC as tiebreaker)
    // Find duplicates and re-point FK references before deleting
    const dupResult = await client.query(`
      SELECT
        keep_id,
        drop_id
      FROM (
        SELECT
          FIRST_VALUE(id) OVER w AS keep_id,
          id AS drop_id,
          ROW_NUMBER() OVER w AS rn
        FROM classes
        WINDOW w AS (
          PARTITION BY grade, section, academic_year
          ORDER BY current_count DESC, id DESC
        )
      ) ranked
      WHERE rn > 1
    `);

    for (const { keep_id, drop_id } of dupResult.rows) {
      // Re-point all FK references from drop_id → keep_id
      await client.query(
        "UPDATE daily_teaching_pulse SET class_id = $1 WHERE class_id = $2",
        [keep_id, drop_id]
      );
      await client.query(
        "UPDATE class_teachers SET class_id = $1 WHERE class_id = $2",
        [keep_id, drop_id]
      );
      await client.query(
        "UPDATE timetables SET class_id = $1 WHERE class_id = $2",
        [keep_id, drop_id]
      );
      await client.query(
        "UPDATE exam_sessions SET class_id = $1 WHERE class_id = $2",
        [keep_id, drop_id]
      );
      await client.query(
        "UPDATE promotion_history SET from_class_id = $1 WHERE from_class_id = $2",
        [keep_id, drop_id]
      );
      await client.query(
        "UPDATE promotion_history SET to_class_id = $1 WHERE to_class_id = $2",
        [keep_id, drop_id]
      );
      // Now safe to delete the duplicate
      await client.query("DELETE FROM classes WHERE id = $1", [drop_id]);
      console.log(`1. Merged class id=${drop_id} into id=${keep_id}`);
    }
    if (dupResult.rows.length === 0) {
      console.log("1. No duplicate classes found");
    }

    // Step 2: Create subjects table
    await client.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id serial PRIMARY KEY,
        name text NOT NULL,
        code text,
        description text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    console.log("2. subjects table created");

    // Step 3: Unique indexes on subjects
    await client.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS subjects_name_idx ON subjects (name)"
    );
    await client.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS subjects_code_idx ON subjects (code) WHERE code IS NOT NULL"
    );
    console.log("3. subjects indexes created");

    // Step 4: Drop old stream-based unique index on classes
    await client.query(
      "DROP INDEX IF EXISTS classes_grade_section_stream_year_idx"
    );
    console.log("4. old classes index dropped");

    // Step 5: Drop stream column
    await client.query(
      "ALTER TABLE classes DROP COLUMN IF EXISTS stream"
    );
    console.log("5. stream column dropped");

    // Step 6: New unique index without stream
    await client.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS classes_grade_section_year_idx ON classes (grade, section, academic_year)"
    );
    console.log("6. new classes index created");

    await client.query("COMMIT");
    console.log("Migration 0021 applied successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
