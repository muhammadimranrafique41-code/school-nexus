-- Examination Module Diagnostic Queries
-- Run these queries to verify the fix and diagnose any remaining issues

-- ============================================================================
-- 1. Check all className variations in the database
-- ============================================================================
SELECT 
  class_name,
  COUNT(*) as student_count,
  STRING_AGG(DISTINCT name, ', ') as sample_students
FROM users
WHERE role = 'student' AND class_name IS NOT NULL
GROUP BY class_name
ORDER BY class_name;

-- ============================================================================
-- 2. Check classes table structure
-- ============================================================================
SELECT 
  id,
  grade,
  section,
  stream,
  academic_year,
  current_count,
  status
FROM classes
ORDER BY grade, section;

-- ============================================================================
-- 3. Check exam sessions and their associated classes
-- ============================================================================
SELECT 
  es.id as exam_session_id,
  es.title,
  es.exam_type,
  c.id as class_id,
  c.grade,
  c.section,
  c.stream,
  c.current_count as expected_students,
  (SELECT COUNT(*) FROM users u 
   WHERE u.role = 'student' 
   AND u.class_name IN (
     c.grade || ' ' || c.section || COALESCE(' - ' || c.stream, ''),
     c.grade || '-' || c.section || COALESCE('-' || c.stream, ''),
     c.grade || c.section || COALESCE('-' || c.stream, ''),
     REPLACE(c.grade, 'Grade-', '') || '-' || c.section || COALESCE('-' || c.stream, ''),
     REPLACE(c.grade, 'Grade-', '') || ' ' || c.section || COALESCE(' ' || c.stream, ''),
     REPLACE(c.grade, 'Grade-', '') || c.section || COALESCE(c.stream, '')
   )
  ) as actual_students_found,
  (SELECT COUNT(*) FROM exam_subjects WHERE exam_session_id = es.id) as subject_count
FROM exam_sessions es
INNER JOIN classes c ON es.class_id = c.id
ORDER BY es.created_at DESC
LIMIT 20;

-- ============================================================================
-- 4. Check for orphaned students (students with className not matching any class)
-- ============================================================================
SELECT 
  u.id,
  u.name,
  u.class_name,
  'No matching class found' as issue
FROM users u
WHERE u.role = 'student' 
AND u.class_name IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM classes c
  WHERE u.class_name IN (
    c.grade || ' ' || c.section || COALESCE(' - ' || c.stream, ''),
    c.grade || '-' || c.section || COALESCE('-' || c.stream, ''),
    c.grade || c.section || COALESCE('-' || c.stream, ''),
    REPLACE(c.grade, 'Grade-', '') || '-' || c.section || COALESCE('-' || c.stream, ''),
    REPLACE(c.grade, 'Grade-', '') || ' ' || c.section || COALESCE(' ' || c.stream, ''),
    REPLACE(c.grade, 'Grade-', '') || c.section || COALESCE(c.stream, '')
  )
);

-- ============================================================================
-- 5. Check exam subjects and their marks entry status
-- ============================================================================
SELECT 
  es.title as exam_title,
  sub.subject_name,
  sub.id as subject_id,
  c.grade || ' ' || c.section as class_label,
  (SELECT COUNT(*) FROM users u 
   WHERE u.role = 'student' 
   AND u.class_name IN (
     c.grade || ' ' || c.section || COALESCE(' - ' || c.stream, ''),
     c.grade || '-' || c.section || COALESCE('-' || c.stream, ''),
     c.grade || c.section || COALESCE('-' || c.stream, ''),
     REPLACE(c.grade, 'Grade-', '') || '-' || c.section || COALESCE('-' || c.stream, ''),
     REPLACE(c.grade, 'Grade-', '') || ' ' || c.section || COALESCE(' ' || c.stream, ''),
     REPLACE(c.grade, 'Grade-', '') || c.section || COALESCE(c.stream, '')
   )
  ) as total_students,
  (SELECT COUNT(*) FROM exam_marks WHERE exam_subject_id = sub.id) as marks_entered,
  (SELECT COUNT(*) FROM exam_marks WHERE exam_subject_id = sub.id AND is_absent = true) as absent_count
FROM exam_subjects sub
INNER JOIN exam_sessions es ON sub.exam_session_id = es.id
INNER JOIN classes c ON es.class_id = c.id
ORDER BY es.created_at DESC, sub.sort_order
LIMIT 50;

-- ============================================================================
-- 6. Verify className format consistency
-- ============================================================================
SELECT 
  CASE 
    WHEN class_name ~ '^Grade-\d+\s+[A-Z]' THEN 'Standard Format (Grade-9 A)'
    WHEN class_name ~ '^Grade-\d+-[A-Z]' THEN 'Hyphenated Format (Grade-9-A)'
    WHEN class_name ~ '^Grade-\d+[A-Z]' THEN 'No Separator (Grade-9A)'
    WHEN class_name ~ '^\d+-[A-Z]' THEN 'No Prefix Hyphen (9-A)'
    WHEN class_name ~ '^\d+\s+[A-Z]' THEN 'No Prefix Space (9 A)'
    WHEN class_name ~ '^\d+[A-Z]' THEN 'Minimal Format (9A)'
    ELSE 'Unknown Format'
  END as format_type,
  COUNT(*) as student_count,
  STRING_AGG(DISTINCT class_name, ', ') as examples
FROM users
WHERE role = 'student' AND class_name IS NOT NULL
GROUP BY format_type
ORDER BY student_count DESC;

-- ============================================================================
-- 7. Check for potential data quality issues
-- ============================================================================
SELECT 
  'Students without className' as issue,
  COUNT(*) as count
FROM users
WHERE role = 'student' AND (class_name IS NULL OR class_name = '')

UNION ALL

SELECT 
  'Students without roll number' as issue,
  COUNT(*) as count
FROM users
WHERE role = 'student' AND (roll_number IS NULL OR roll_number = '')

UNION ALL

SELECT 
  'Exam sessions without subjects' as issue,
  COUNT(*) as count
FROM exam_sessions es
WHERE NOT EXISTS (SELECT 1 FROM exam_subjects WHERE exam_session_id = es.id)

UNION ALL

SELECT 
  'Classes with 0 students' as issue,
  COUNT(*) as count
FROM classes c
WHERE NOT EXISTS (
  SELECT 1 FROM users u 
  WHERE u.role = 'student' 
  AND u.class_name IN (
    c.grade || ' ' || c.section || COALESCE(' - ' || c.stream, ''),
    c.grade || '-' || c.section || COALESCE('-' || c.stream, ''),
    c.grade || c.section || COALESCE('-' || c.stream, ''),
    REPLACE(c.grade, 'Grade-', '') || '-' || c.section || COALESCE('-' || c.stream, ''),
    REPLACE(c.grade, 'Grade-', '') || ' ' || c.section || COALESCE(' ' || c.stream, ''),
    REPLACE(c.grade, 'Grade-', '') || c.section || COALESCE(c.stream, '')
  )
);

-- ============================================================================
-- 8. Performance check: Index verification
-- ============================================================================
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('users', 'classes', 'exam_sessions', 'exam_subjects', 'exam_marks')
AND indexname LIKE '%class%' OR indexname LIKE '%role%'
ORDER BY tablename, indexname;

-- ============================================================================
-- 9. Recommended index creation (if not exists)
-- ============================================================================
-- Run this if the index doesn't exist from query #8
CREATE INDEX IF NOT EXISTS idx_users_role_classname 
ON users(role, class_name) 
WHERE role = 'student';

-- ============================================================================
-- 10. Test className matching for a specific class
-- ============================================================================
-- Replace 'Grade-9' and 'A' with your actual class values
WITH test_class AS (
  SELECT 
    'Grade-9' as grade,
    'A' as section,
    NULL::text as stream
),
class_variations AS (
  SELECT 
    grade || ' ' || section || COALESCE(' - ' || stream, '') as variation_1,
    grade || '-' || section || COALESCE('-' || stream, '') as variation_2,
    grade || section || COALESCE('-' || stream, '') as variation_3,
    REPLACE(grade, 'Grade-', '') || '-' || section || COALESCE('-' || stream, '') as variation_4,
    REPLACE(grade, 'Grade-', '') || ' ' || section || COALESCE(' ' || stream, '') as variation_5,
    REPLACE(grade, 'Grade-', '') || section || COALESCE(stream, '') as variation_6
  FROM test_class
)
SELECT 
  u.id,
  u.name,
  u.class_name,
  u.roll_number
FROM users u
CROSS JOIN class_variations cv
WHERE u.role = 'student'
AND u.class_name IN (
  cv.variation_1,
  cv.variation_2,
  cv.variation_3,
  cv.variation_4,
  cv.variation_5,
  cv.variation_6
)
ORDER BY u.roll_number;
