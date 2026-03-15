ALTER TABLE homework_assignments
  DROP CONSTRAINT IF EXISTS homework_assignments_class_id_due_date_subject_key;

ALTER TABLE homework_assignments
  DROP CONSTRAINT IF EXISTS homework_assignments_class_date_subject_idx;

DROP INDEX IF EXISTS homework_assignments_class_date_subject_idx;
