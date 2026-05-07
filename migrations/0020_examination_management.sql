CREATE TABLE IF NOT EXISTS "grade_scales" (
  "id" serial PRIMARY KEY NOT NULL,
  "grade" text NOT NULL UNIQUE,
  "min_percentage" numeric(5,2) NOT NULL,
  "max_percentage" numeric(5,2) NOT NULL,
  "gpa_points" numeric(3,2) NOT NULL,
  "division" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "exam_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "academic_session_id" integer NOT NULL REFERENCES "academic_sessions"("id") ON DELETE restrict,
  "class_id" integer NOT NULL REFERENCES "classes"("id") ON DELETE cascade,
  "exam_type" text NOT NULL,
  "month_label" text,
  "title" text NOT NULL,
  "start_date" timestamp NOT NULL,
  "end_date" timestamp NOT NULL,
  "total_marks" integer NOT NULL,
  "passing_marks" integer NOT NULL,
  "is_result_declared" boolean DEFAULT false NOT NULL,
  "declared_at" timestamp,
  "created_by" integer NOT NULL REFERENCES "users"("id") ON DELETE restrict,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_exam_session" ON "exam_sessions" ("academic_session_id","class_id","exam_type","month_label");
CREATE INDEX IF NOT EXISTS "idx_exam_session_class" ON "exam_sessions" ("class_id");

CREATE TABLE IF NOT EXISTS "exam_subjects" (
  "id" serial PRIMARY KEY NOT NULL,
  "exam_session_id" integer NOT NULL REFERENCES "exam_sessions"("id") ON DELETE cascade,
  "subject_name" text NOT NULL,
  "subject_code" text,
  "max_theory_marks" integer NOT NULL,
  "max_practical_marks" integer DEFAULT 0 NOT NULL,
  "exam_date" timestamp NOT NULL,
  "exam_time" text,
  "venue" text,
  "sort_order" integer DEFAULT 0 NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_exam_subject_session" ON "exam_subjects" ("exam_session_id");

CREATE TABLE IF NOT EXISTS "exam_marks" (
  "id" serial PRIMARY KEY NOT NULL,
  "exam_subject_id" integer NOT NULL REFERENCES "exam_subjects"("id") ON DELETE cascade,
  "student_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "theory_marks" numeric(5,2),
  "practical_marks" numeric(5,2),
  "total_obtained" numeric(5,2),
  "grade" text,
  "is_absent" boolean DEFAULT false NOT NULL,
  "is_exempted" boolean DEFAULT false NOT NULL,
  "remarks" text,
  "entered_by" integer REFERENCES "users"("id"),
  "entered_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_exam_mark" ON "exam_marks" ("exam_subject_id","student_id");
CREATE INDEX IF NOT EXISTS "idx_exam_marks_student" ON "exam_marks" ("student_id");

CREATE TABLE IF NOT EXISTS "exam_attendance" (
  "id" serial PRIMARY KEY NOT NULL,
  "exam_session_id" integer NOT NULL REFERENCES "exam_sessions"("id") ON DELETE cascade,
  "student_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "total_days" integer DEFAULT 0 NOT NULL,
  "present_days" integer DEFAULT 0 NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_exam_attendance" ON "exam_attendance" ("exam_session_id","student_id");

INSERT INTO "grade_scales" ("grade","min_percentage","max_percentage","gpa_points","division")
VALUES
  ('A+', '90', '100', '4.00', 'Distinction'),
  ('A', '80', '89', '3.75', 'First Division'),
  ('B', '70', '79', '3.25', 'First Division'),
  ('C', '60', '69', '2.75', 'Second Division'),
  ('D', '50', '59', '2.25', 'Third Division'),
  ('E', '40', '49', '1.75', 'Pass'),
  ('F', '0', '39', '0.00', 'Fail')
ON CONFLICT ("grade") DO NOTHING;
