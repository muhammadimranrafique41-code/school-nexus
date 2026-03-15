-- One-time safety script to create timetable table if missing (does not touch drizzle migrations).
-- Run manually: psql $env:DATABASE_URL -f script/create-missing-timetable.sql

CREATE TABLE IF NOT EXISTS timetable (
  id serial PRIMARY KEY NOT NULL,
  academic_id integer,
  class_name text NOT NULL,
  day_of_week text NOT NULL,
  period_label text NOT NULL,
  start_time text NOT NULL,
  end_time text NOT NULL,
  room text,
  class_type text,
  teacher_id integer,
  sort_order integer DEFAULT 0 NOT NULL
);

DO $$ BEGIN
  ALTER TABLE timetable
    ADD CONSTRAINT timetable_academic_id_academics_id_fk
    FOREIGN KEY (academic_id) REFERENCES academics(id)
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE timetable
    ADD CONSTRAINT timetable_teacher_id_users_id_fk
    FOREIGN KEY (teacher_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
