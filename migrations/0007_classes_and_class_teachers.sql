CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  grade TEXT NOT NULL,
  section TEXT NOT NULL,
  stream TEXT,
  academic_year TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 40,
  current_count INTEGER NOT NULL DEFAULT 0,
  homeroom_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE UNIQUE INDEX IF NOT EXISTS classes_grade_section_stream_year_idx
  ON classes(grade, section, stream, academic_year);

CREATE TABLE IF NOT EXISTS class_teachers (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  subjects TEXT[] NOT NULL,
  periods_per_week INTEGER NOT NULL DEFAULT 4,
  priority INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS class_teachers_class_teacher_subjects_idx
  ON class_teachers(class_id, teacher_id, subjects);

CREATE INDEX IF NOT EXISTS class_teachers_class_id_idx
  ON class_teachers(class_id);

CREATE INDEX IF NOT EXISTS class_teachers_teacher_id_idx
  ON class_teachers(teacher_id);

