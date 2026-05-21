# Unused Files Report — School Management System

> Generated during Phase 1 (Project Audit) — Files identified for review and potential removal.

---

## Category 1: Temporary / Cache / Build Artifacts

| File | Reason | Action |
|------|--------|--------|
| `tmp/ai-dev-err.log` | AI development error logs | Remove |
| `tmp/ai-dev-out.log` | AI development output logs | Remove |
| `tmp/ap_patch_test.txt` | Patch test artifact | Remove |
| `tmp/test_endpoint.ts` | Debug/test endpoint | Remove |
| `tmp/verify_settings.ts` | Debug settings verification | Remove |
| `coverage/index.html` | Test coverage report artifact | Remove |
| `dist/public/assets/index-*.{css,js}` | Old build artifacts | Clean on rebuild |
| `server-err.log` | Runtime error log | Remove |
| `server-out.log` | Runtime output log | Remove |
| `server-err.txt` | Duplicate error log | Remove |
| `server-out.txt` | Duplicate output log | Remove |
| `temp_files.txt` | Temporary file listing | Remove |
| `temp_query.sql` | Temporary SQL query | Remove |
| `cookie.txt` | Debug cookie file | Remove |

## Category 2: Debug / Audit Scripts (Root)

| File | Reason | Action |
|------|--------|--------|
| `audit-data.js` | One-time data audit | Remove after review |
| `audit-db.js` | One-time DB audit | Remove after review |
| `audit-match.js` | One-time matching audit | Remove after review |
| `audit-names.js` | One-time name audit | Remove after review |
| `audit-timetable.js` | One-time timetable audit | Remove after review |
| `db_drop_corrupt.js` | DB corruption fix script | Remove after review |
| `db_fix_final.ts` | Final DB fix script | Remove after review |
| `db_fix.js` | DB fix script | Remove after review |
| `db_inspect.js` | DB inspection script | Remove after review |
| `db_push_test.js` | DB push test | Remove after review |
| `db_test.ts` | DB test | Remove after review |
| `db_verify.js` | DB verification | Remove after review |
| `execute_sql.ts` | SQL execution script | Remove after review |
| `final_db_fix.ts` | Final DB fix | Remove after review |
| `fix_session.ts` | Session fix script | Remove after review |
| `fix-saturday.js` | Saturday fix script | Remove after review |
| `inspect_fee_18.js` | Fee inspection | Remove after review |
| `test_zod.ts` | Zod test | Remove after review |
| `test-tsx.ts` | TSX test | Remove after review |
| `seed.ts` | DB seed script | Keep (used for seeding) |
| `pg-mcp.cjs` | PG MCP config | Remove after review |
| `pg-mcp.sh` | PG MCP shell script | Remove after review |
| `cross-env` | Binary file? | Remove |

## Category 3: Duplicate Files

| File | Duplicate Of | Action |
|------|-------------|--------|
| `lib/validators/classes.ts` | `client/src/lib/validators/classes.ts` | Consolidate |
| `public/assets/index-*.{css,js}` | Build outputs | Remove on rebuild |

## Category 4: Unused/Redundant Configuration

| File | Reason | Action |
|------|--------|--------|
| `.replit` | Replit-specific config | Keep (platform config) |
| `.vercel/project.json` | Vercel deployment config | Keep (deployment) |
| `.vercel/README.txt` | Vercel readme | Review |
| `vercel.json` | Vercel config | Keep (deployment) |

## Category 5: Documentation Files (Keep as reference)

| File | Action |
|------|--------|
| `docs/*.md` | Keep (documentation) |
| `*.md` (root-level plan files) | Keep (implementation plans) |

## Category 6: Test Artifacts

| File | Reason | Action |
|------|--------|--------|
| `playwright-report/` | E2E test reports | Can be regenerated |
| `test-results/` | Test results | Can be regenerated |
| `coverage/` | Coverage reports | Can be regenerated |

## Category 7: Mixed Test Files in Source

| File | Reason | Action |
|------|--------|--------|
| `client/src/components/dashboard/StatsCards.test.tsx` | Test in source | Keep as component test |
| `client/src/components/attendance/AttendanceCalendar.test.tsx` | Test in source | Keep as component test |
| `client/src/components/homework/AssignmentDetail.test.tsx` | Test in source | Keep as component test |
| `client/src/components/homework/AssignmentList.test.tsx` | Test in source | Keep as component test |
| `client/src/components/finance/FeeTable.test.tsx` | Test in source | Keep as component test |
| `client/src/components/qr-id-card-print.test.ts` | Test in source | Keep as component test |
| `client/src/lib/qr-attendance-offline.test.ts` | Test in source | Keep as component test |
| `server/*.test.ts` | Server tests | Keep as component tests |
| `client/src/mocks/` | MSW mocks for testing | Keep (testing infrastructure) |

---

## Total Unused/Safe-to-Remove Size Estimate
- ~27 debug/audit/script files
- ~6 temporary/log files
- ~2 duplicate config directories
- ~3 build/test artifact directories

## Recommended Actions
1. **SAFE TO DELETE IMMEDIATELY:** tmp/*, *.log, *.txt logs, cookie.txt, coverage/, temp_*
2. **REVIEW BEFORE DELETE:** Root audit/DB scripts
3. **KEEP:** Documentation, implementation plans, test infrastructure, migration files, production configs
