# Database Migration Guide

## Quick Reference

### Apply All Pending Migrations
```bash
npx tsx script/run-drizzle-migrations.ts
```

### Apply Specific Migration (Manual)
```bash
npx tsx script/apply-exam-migration.ts
```

### Verify Tables Exist
```bash
npx tsx script/verify-exam-tables.ts
```

## Migration Scripts

### 1. run-drizzle-migrations.ts
Uses Drizzle ORM's built-in migration function to apply all pending migrations from the `migrations/` folder.

**When to use**: 
- When you have proper snapshot files in `migrations/meta/`
- For standard migration workflows

**Limitations**:
- Requires snapshot files for each migration
- May fail if snapshots are missing

### 2. apply-exam-migration.ts
Manually applies the examination management migration by reading and executing the SQL file directly.

**When to use**:
- When snapshot files are missing
- For one-off migration fixes
- When Drizzle's migrate function fails

**Note**: This script specifically applies `0020_examination_management.sql`

### 3. verify-exam-tables.ts
Checks if required tables exist in the database.

**When to use**:
- After applying migrations
- To troubleshoot missing table errors
- As a health check

## Common Issues

### Issue: "relation does not exist" error
**Cause**: Required database tables haven't been created
**Solution**: Run the appropriate migration script

### Issue: Drizzle migration fails with "snapshot not found"
**Cause**: Missing snapshot files in `migrations/meta/`
**Solution**: Use the manual migration script or regenerate snapshots with Drizzle Kit

### Issue: Migration appears to succeed but tables don't exist
**Cause**: SQL syntax errors or transaction rollback
**Solution**: Check the migration SQL file for errors, apply manually

## Best Practices

1. **Always backup your database** before running migrations in production
2. **Test migrations** in a development environment first
3. **Verify tables** after applying migrations
4. **Keep snapshots** in version control for Drizzle migrations
5. **Document changes** when adding new migrations

## Creating New Migrations

### Using Drizzle Kit (Recommended)
```bash
npx drizzle-kit generate:pg
```

This will:
- Generate SQL migration files
- Create snapshot files
- Update the journal

### Manual Migration
If creating migrations manually:
1. Create the SQL file in `migrations/` with the next sequential number
2. Use `CREATE TABLE IF NOT EXISTS` for idempotency
3. Test the migration in development
4. Consider creating a snapshot file or use manual application

## Troubleshooting

### Check Applied Migrations
Look at `migrations/meta/_journal.json` to see which migrations have been applied.

### Check Database Tables
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

### Check Migration History
```sql
SELECT * FROM __drizzle_migrations ORDER BY created_at DESC;
```

## Migration Files

Current migrations in the project:
- 0000-0018: Core system tables (already applied)
- 0019: Wallet system (parent_wallets, wallet_transactions)
- 0020: Examination management (exam_sessions, exam_subjects, exam_marks, exam_attendance, grade_scales)

## Support

If you encounter issues:
1. Check the error message carefully
2. Verify your DATABASE_URL is correct
3. Ensure you have database permissions
4. Check the migration SQL for syntax errors
5. Use the verification script to confirm table existence
