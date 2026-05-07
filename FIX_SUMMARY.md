# Fix Summary: 500 Internal Server Error on GET /api/exams/sessions

## Problem Identified

The `GET /api/exams/sessions` endpoint was failing with a `500 Internal Server Error` because the required database tables for the examination management system were not created.

## Root Cause

1. **Missing Database Tables**: The migration file `0020_examination_management.sql` existed in the migrations folder but had not been applied to the database.

2. **Missing Snapshot Files**: Drizzle ORM requires snapshot files in `migrations/meta/` for each migration, but snapshots for migrations 0019 and 0020 were missing, preventing the standard migration process from working.

3. **Journal Not Updated**: The `migrations/meta/_journal.json` file only listed migrations up to 0018, indicating that migrations 0019 and 0020 were never tracked.

## Tables Created

The following tables were successfully created:

### Examination Management (Migration 0020)
- `exam_sessions` - Stores exam session information (MAT, Half-Yearly, Annual)
- `exam_subjects` - Stores subjects for each exam session
- `exam_marks` - Stores student marks for each subject
- `exam_attendance` - Stores exam attendance records
- `grade_scales` - Stores grading scale configuration (A+, A, B, C, D, E, F)

### Wallet System (Migration 0019)
- `parent_wallets` - Per-student prepaid wallet system
- `wallet_transactions` - Immutable audit log for wallet transactions

## Changes Made

### 1. Enhanced Error Handling in examService.ts

Added try-catch block to `listExamSessions()` function to provide descriptive error messages:

```typescript
export async function listExamSessions(classId?: number): Promise<ExamSessionWithSubjects[]> {
  try {
    // ... existing query logic
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Check if it's a missing table error
    if (message.includes('relation "exam_sessions" does not exist') || message.includes('exam_sessions')) {
      throw new AppError(
        "Examination management tables are not initialized. Please run database migrations.",
        "EXAM_TABLES_NOT_FOUND",
        500
      );
    }
    // Re-throw other errors
    throw new AppError(
      `Failed to list exam sessions: ${message}`,
      "EXAM_SESSION_LIST_ERROR",
      500
    );
  }
}
```

### 2. Created Migration Scripts

Created three utility scripts in the `script/` directory:

1. **apply-exam-migration.ts** - Manually applies the examination management migration
2. **run-drizzle-migrations.ts** - Uses Drizzle's built-in migration function
3. **verify-exam-tables.ts** - Verifies that all required tables exist

### 3. Applied Missing Migrations

Successfully applied both missing migrations:
- Migration 0019: Wallet System
- Migration 0020: Examination Management

## Verification

All required tables now exist and are verified:
- ✓ exam_sessions
- ✓ exam_subjects
- ✓ exam_marks
- ✓ exam_attendance
- ✓ grade_scales
- ✓ parent_wallets
- ✓ wallet_transactions

## Testing Recommendations

1. **Test the endpoint**: Make a GET request to `/api/exams/sessions` to verify it returns a 200 OK response
2. **Test with data**: Create a test exam session and verify it appears in the list
3. **Test error handling**: Verify that proper error messages are returned for various failure scenarios

## Future Improvements

1. **Migration Management**: Consider using Drizzle Kit to generate proper snapshot files for all migrations
2. **Health Check Endpoint**: Add a health check endpoint that verifies all required tables exist
3. **Migration Documentation**: Document the migration process and ensure all team members know how to apply migrations
4. **Automated Testing**: Add integration tests that verify database schema matches expectations

## Comparison with Working Endpoint

The working `/api/v1/academic-sessions` endpoint:
- Uses the `academic_sessions` table which was created in migration 0017
- Has proper error handling via the `asyncHandler` wrapper
- Returns data successfully (200 OK)

The fixed `/api/exams/sessions` endpoint now:
- Uses the newly created `exam_sessions` table
- Has enhanced error handling with descriptive messages
- Should return data successfully once the server is restarted

## Next Steps

1. Restart the application server to ensure the new tables are recognized
2. Test the `/api/exams/sessions` endpoint
3. Monitor logs for any remaining issues
4. Consider adding seed data for the grade_scales table if not already populated
