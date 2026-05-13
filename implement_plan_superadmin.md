# Implementation Plan: Super Admin (Platform Management) Module
**Project:** School-Nexus
**Module:** Super Admin — Platform-Wide Administration
**Author:** Senior Full-Stack Architect
**Date:** 2026-05-13
**Status:** `DRAFT`
**Stack:** Vite + React 18 · Node.js + Express · Drizzle ORM · PostgreSQL · Shadcn/ui · Tailwind CSS

---

## Table of Contents

1. [Objective](#1-objective)
2. [Reference Architecture Analysis](#2-reference-architecture-analysis)
3. [Database Schema Changes](#3-database-schema-changes)
4. [Folder Structure](#4-folder-structure)
5. [Backend Service Layer](#5-backend-service-layer)
6. [API & Route Layer](#6-api--route-layer)
7. [Security Architecture](#7-security-architecture)
8. [Frontend Implementation](#8-frontend-implementation)
9. [Audit Logging System](#9-audit-logging-system)
10. [Service Suspension Middleware](#10-service-suspension-middleware)
11. [JazzCash Platform-Level Integration](#11-jazzcash-platform-level-integration)
12. [Impersonation Mode](#12-impersonation-mode)
13. [System Health Monitor](#13-system-health-monitor)
14. [Phase-by-Phase Roadmap](#14-phase-by-phase-roadmap)
15. [Quality Gates](#15-quality-gates)

---

## 1. Objective

Provide **Super Admins** with a centralized **"Platform Management"** hub inside School-Nexus. The module must:

- Aggregate analytics across all owners, campuses, and platform-wide financial metrics.
- Offer full **CRUD management** for owners and their associated campuses.
- Control **subscription billing** and payment status across the entire platform.
- Enforce **service suspension** via middleware-level checks when owners have unpaid invoices.
- Support **secure impersonation** of owners or admins for troubleshooting.
- Provide a **system health monitor** and global **audit logs**.
- Mirror the **"Slate-First" design language** and Shadcn/ui patterns established in the codebase.

---

## 2. Reference Architecture Analysis

### 2.1 Existing Patterns to Follow

The module must follow the exact patterns established in the reference documents:

| Pattern | Reference | Application |
|---------|-----------|-------------|
| Service layer | `schoolService.ts` | All DB queries via Drizzle ORM in `superAdminService.ts` |
| Route organization | `ownerRouter.ts` | Router with Zod validation + `asyncHandler` in `superAdminRouter.ts` |
| Multi-tenancy | `implement_plan_myschool.md §8.2` | `WHERE owner_id = :id` enforced at service layer |
| Schema structure | `shared/schema.ts` | New tables in `shared/schema.ts` under `// ═══ PLATFORM MANAGEMENT ═══` |
| Sidebar integration | `app-sidebar.tsx` | New `superAdminSections` with `shield` icon, role-gated |
| Audit logging | `ledger_ui_plan.md` patterns | Append-only `audit_logs` table with structured JSON payload |
| Payment integration | `jazzcashService.ts` | Extend with platform-level fee collection methods |

### 2.2 Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Vite/React)                        │
│  /super-admin/*  ──→  SuperAdminLayout                            │
│    ├── /overview          PlatformOverviewPage                    │
│    ├── /owners            OwnersPage                              │
│    ├── /owners/:id         OwnerDetailPage                         │
│    ├── /billing           PlatformBillingPage                     │
│    ├── /audit-logs         AuditLogsPage                          │
│    ├── /system-health      SystemHealthPage                       │
│    └── /settings           PlatformSettingsPage                    │
└────────────────────────────┬───────────────────────────────────────┘
                             │ REST (Axios + React Query)
┌────────────────────────────▼───────────────────────────────────────┐
│                  BACKEND (Express + Drizzle ORM)                    │
│  /api/super-admin/*  ──→  superAdminRouter                         │
│    ├── GET  /platform-stats                                        │
│    ├── GET  /owners                                                │
│    ├── POST /owners                                                │
│    ├── GET  /owners/:id                                            │
│    ├── PATCH /owners/:id                                           │
│    ├── DELETE /owners/:id                                          │
│    ├── GET  /owners/:id/campuses                                    │
│    ├── GET  /billing                                               │
│    ├── PATCH /billing/:id/status                                   │
│    ├── GET  /audit-logs                                            │
│    ├── GET  /system-health                                         │
│    ├── POST /impersonate                                            │
│    ├── POST /end-impersonation                                      │
│    ├── GET  /platform-settings                                      │
│    └── PATCH /platform-settings                                    │
│                                                                   │
│  Middleware:  authMiddleware → requireRole('super_admin')          │
│  Service:     server/services/superAdminService.ts                 │
│  Impersonation middleware chain applied after auth                 │
└────────────────────────────┬───────────────────────────────────────┘
                             │ Drizzle ORM queries
┌────────────────────────────▼───────────────────────────────────────┐
│                      PostgreSQL                                     │
│  Tables: owners (MODIFIED +status), campuses, billing_records,      │
│          jazzcash_payment_intents, audit_logs, platform_settings    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema Changes

### 3.1 `owners` Table — Add `status` Column

A **additive-only** migration to the existing `owners` table:

```sql
-- migrations/XXXX_add_owner_status.sql
ALTER TABLE owners ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE'
  CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ON_TRIAL', 'CANCELLED'));
ALTER TABLE owners ADD COLUMN suspended_at TIMESTAMP;
ALTER TABLE owners ADD COLUMN suspended_reason TEXT;
ALTER TABLE owners ADD COLUMN grace_period_days INTEGER NOT NULL DEFAULT 30;
```

**Status semantics:**
- `ACTIVE`: Normal operations. All users can log in.
- `ON_TRIAL`: Trial period. Grace period counted from `created_at`.
- `SUSPENDED`: Manually or automatically suspended due to non-payment.
- `CANCELLED`: Soft-deleted. `is_deleted` flag set, not physically deleted.

### 3.2 `audit_logs` Table (New)

```typescript
// shared/schema.ts — append under // ═══ PLATFORM MANAGEMENT ═══

import {
  pgTable, serial, text, jsonb, timestamp, integer,
  index, uniqueIndex
} from 'drizzle-orm/pg-core';

export const auditLogs = pgTable('audit_logs', {
  id:               serial('id').primaryKey(),
  actorId:          integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actorRole:        text('actor_role').notNull(),           // 'super_admin' | 'system'
  action:           text('action').notNull(),               // e.g. 'BILLING_OVERRIDE', 'SERVICE_SUSPEND'
  entityType:       text('entity_type').notNull(),          // 'owner' | 'billing_record' | 'platform_setting'
  entityId:         integer('entity_id'),
  targetOwnerId:    integer('target_owner_id').references(() => users.id, { onDelete: 'set null' }),
  metadata:         jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  ipAddress:        text('ip_address'),
  userAgent:        text('user_agent'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  actorIdx:        index('idx_audit_actor').on(t.actorId),
  actionIdx:       index('idx_audit_action').on(t.action),
  targetOwnerIdx:  index('idx_audit_target_owner').on(t.targetOwnerId),
  createdAtIdx:    index('idx_audit_created').on(t.createdAt),
  uniqueEntity:    uniqueIndex('uq_audit_entity').on(t.entityType, t.entityId, t.action, t.createdAt),
}));

export type SelectAuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
```

**Audit action codes:**
| Action Code | Triggered By |
|------------|-------------|
| `OWNER_CREATED` | Super Admin creates a new owner |
| `OWNER_SUSPENDED` | Auto (payment overdue) or manual suspension |
| `OWNER_REACTIVATED` | Manual reactivation by Super Admin |
| `BILLING_OVERRIDE` | Super Admin manually changes billing record status |
| `SERVICE_SUSPEND` | Automatic suspension trigger |
| `IMPERSONATION_START` | Super Admin starts impersonation session |
| `IMPERSONATION_END` | Super Admin ends impersonation session |
| `PLATFORM_SETTING_CHANGE` | Any change to `platform_settings` |
| `MANUAL_BILLING_ENTRY` | Super Admin creates a billing record manually |

### 3.3 `platform_settings` Table (New)

```typescript
// shared/schema.ts — append under // ═══ PLATFORM MANAGEMENT ═══

export const platformSettings = pgTable('platform_settings', {
  id:                serial('id').primaryKey(),
  key:               text('key').notNull().unique(),
  value:             jsonb('value').notNull(),
  description:       text('description'),
  category:          text('category').notNull().default('general'),
  // 'billing' | 'suspension' | 'general' | 'impersonation' | 'notification'
  isEncrypted:       boolean('is_encrypted').notNull().default(false),
  updatedBy:         integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
});

export type SelectPlatformSetting = typeof platformSettings.$inferSelect;
export type InsertPlatformSetting = typeof platformSettings.$inferInsert;
```

**Initial settings to seed:**

| Key | Default Value | Category | Description |
|-----|-------------|----------|-------------|
| `grace_period_days` | `30` | `suspension` | Days after due date before auto-suspension |
| `trial_period_days` | `14` | `suspension` | Days in trial period before first invoice |
| `monthly_fee_pkr` | `5000` | `billing` | Default monthly platform fee per owner |
| `late_fee_pkr` | `500` | `billing` | Late payment penalty |
| `impersonation_max_duration_minutes` | `60` | `impersonation` | Max impersonation session length |
| `audit_log_retention_days` | `365` | `general` | Days to retain audit logs before archival |
| `min_payment_for_warning` | `1000` | `billing` | Minimum unpaid amount to trigger warning |

### 3.4 Migration Execution

```bash
# Generate migration
npx drizzle-kit generate:pg --schema=shared/schema.ts

# Review generated SQL before applying
npx drizzle-kit push:pg

# Seed platform_settings
# (seed file: server/db/seeds/platformSettingsSeed.ts)
```

---

## 4. Folder Structure

```
school-nexus/
├── client/
│   └── src/
│       ├── pages/
│       │   └── super-admin/
│       │       ├── SuperAdminLayout.tsx          # Secondary sidebar + outlet
│       │       ├── overview/
│       │       │   ├── PlatformOverviewPage.tsx
│       │       │   ├── PlatformStatCards.tsx
│       │       │   ├── PlatformGrowthChart.tsx
│       │       │   └── ActiveSchoolsTable.tsx
│       │       ├── owners/
│       │       │   ├── OwnersPage.tsx
│       │       │   ├── OwnerTable.tsx
│       │       │   ├── OwnerFormDialog.tsx        # Create / Edit
│       │       │   ├── OwnerDetailDrawer.tsx      # Slide-over with campuses
│       │       │   └── OwnerStatusBadge.tsx
│       │       ├── billing/
│       │       │   ├── PlatformBillingPage.tsx
│       │       │   ├── BillingTable.tsx
│       │       │   ├── BillingOverrideDialog.tsx
│       │       │   └── PaymentStatusBadge.tsx
│       │       ├── audit-logs/
│       │       │   ├── AuditLogsPage.tsx
│       │       │   └── AuditLogTable.tsx
│       │       ├── system-health/
│       │       │   ├── SystemHealthPage.tsx
│       │       │   ├── HealthCards.tsx
│       │       │   └── ApiLatencyChart.tsx
│       │       └── settings/
│       │           ├── PlatformSettingsPage.tsx
│       │           └── SettingField.tsx
│       ├── components/
│       │   └── super-admin/
│       │       ├── ServiceSuspensionBanner.tsx   # "Payment Required" banner
│       │       ├── ImpersonationBadge.tsx        # Shows when impersonating
│       │       └── ConfirmActionDialog.tsx       # Reusable destructive action confirm
│       ├── hooks/
│       │   └── super-admin/
│       │       ├── usePlatformStats.ts
│       │       ├── useOwners.ts
│       │       ├── useBilling.ts
│       │       ├── useAuditLogs.ts
│       │       ├── useSystemHealth.ts
│       │       ├── useImpersonation.ts
│       │       └── usePlatformSettings.ts
│       └── lib/
│           └── api/
│               └── superAdminApi.ts               # Axios call wrappers
│
└── server/
    ├── routes/
    │   └── superAdminRouter.ts                   # Mounts at /api/super-admin
    ├── services/
    │   ├── superAdminService.ts                  # All DB logic lives here
    │   ├── auditLogService.ts                    # Dedicated audit log writer
    │   └── platformBillingService.ts              # JazzCash platform fee collection
    ├── middleware/
    │   ├── requireRole.ts                        # Existing — add 'super_admin' role
    │   ├── serviceSuspensionMiddleware.ts         # NEW: blocks suspended owners
    │   ├── impersonationMiddleware.ts            # NEW: tracks impersonation sessions
    │   └── auditLogMiddleware.ts                 # NEW: auto-logs sensitive actions
    └── db/
        └── seeds/
            └── platformSettingsSeed.ts            # Initial platform settings
```

---

## 5. Backend Service Layer

### 5.1 `superAdminService.ts`

```typescript
// server/services/superAdminService.ts
import { db } from '../db';
import { sql, eq, and, gte, lte, count, sum, desc, asc } from 'drizzle-orm';
import {
  users,
  campuses,
  billingRecords,
  jazzcashPaymentIntents,
  owners,
  auditLogs,
  platformSettings,
  type SelectOwner,
  type InsertOwner,
} from '../../shared/schema';
import { AppError } from '../errors';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlatformStats {
  totalOwners: number;
  totalCampuses: number;
  totalStudents: number;
  totalRevenuePaise: number;
  totalPendingDuesPaise: number;
  activeSchools: number;
  inactiveSchools: number;
  suspendedSchools: number;
  trialSchools: number;
  platformGrowthPercent30d: number;
  pendingInvoicesCount: number;
  overdueInvoicesCount: number;
}

export interface OwnerRow extends SelectOwner {
  campusCount: number;
  studentCount: number;
  pendingDuesPaise: number;
  lastBillingDate: string | null;
}

export interface BillingRecordRow {
  id: number;
  ownerId: number;
  ownerName: string;
  campusId: number;
  campusName: string;
  amountPaise: number;
  status: 'PAID' | 'PENDING' | 'OVERDUE' | 'CANCELLED';
  billingMonth: number;
  billingYear: number;
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
}

export interface SystemHealthStatus {
  databaseConnected: boolean;
  databaseLatencyMs: number;
  storageUsedBytes: number;
  storageTotalBytes: number;
  apiLatencyP50Ms: number;
  apiLatencyP95Ms: number;
  activeSessions: number;
  timestamp: string;
}

// ─── Platform Stats ──────────────────────────────────────────────────────────

export async function getPlatformStats(): Promise<PlatformStats> {
  const [[ownerCount], [campusCount], [studentCount], [activeCount], [suspendedCount],
         [trialCount], [overdueCount], [pendingCount]] = await Promise.all([
    db.select({ value: count() }).from(users).where(eq(users.role, 'owner')),
    db.select({ value: count() }).from(campuses),
    db.select({ value: count() }).from(sql`${users.role} = 'student'`),
    db.select({ value: count() }).from(owners).where(eq(owners.status, 'ACTIVE')),
    db.select({ value: count() }).from(owners).where(eq(owners.status, 'SUSPENDED')),
    db.select({ value: count() }).from(owners).where(eq(owners.status, 'ON_TRIAL')),
    db.select({ value: count() }).from(billingRecords).where(eq(billingRecords.status, 'OVERDUE')),
    db.select({ value: count() }).from(billingRecords).where(eq(billingRecords.status, 'PENDING')),
  ]);

  // Total revenue from completed payment intents + PAID billing records
  const [revenueResult] = await db
    .select({ value: sum(jazzcashPaymentIntents.appliedAmountPkr) })
    .from(jazzcashPaymentIntents)
    .where(eq(jazzcashPaymentIntents.status, 'COMPLETED'));

  // Total pending dues
  const [pendingDuesResult] = await db
    .select({ value: sum(billingRecords.amountPaise) })
    .from(billingRecords)
    .where(sql`${billingRecords.status} IN ('PENDING', 'OVERDUE')`);

  return {
    totalOwners:               Number(ownerCount?.value ?? 0),
    totalCampuses:             Number(campusCount?.value ?? 0),
    totalStudents:             Number(studentCount?.value ?? 0),
    totalRevenuePaise:         Number(revenueResult?.value ?? 0),
    totalPendingDuesPaise:     Number(pendingDuesResult?.value ?? 0),
    activeSchools:             Number(activeCount?.value ?? 0),
    inactiveSchools:           Number(activeCount?.value ?? 0) - Number(suspendedCount?.value ?? 0),
    suspendedSchools:          Number(suspendedCount?.value ?? 0),
    trialSchools:              Number(trialCount?.value ?? 0),
    platformGrowthPercent30d:   0, // TODO: compute from campus count delta over 30 days
    pendingInvoicesCount:       Number(pendingCount?.value ?? 0),
    overdueInvoicesCount:      Number(overdueCount?.value ?? 0),
  };
}

// ─── Owner CRUD ───────────────────────────────────────────────────────────────

export async function getOwners(): Promise<OwnerRow[]> {
  const allOwners = await db.select().from(owners).orderBy(desc(owners.createdAt));

  const enriched = await Promise.all(allOwners.map(async (owner) => {
    const [[campusCount], [pendingDues]] = await Promise.all([
      db.select({ value: count() }).from(campuses).where(eq(campuses.ownerId, owner.id)),
      db.select({ value: sum(billingRecords.amountPaise) })
        .from(billingRecords)
        .where(and(
          sql`${billingRecords.campusId} IN (SELECT id FROM campuses WHERE owner_id = ${owner.id})`,
          sql`${billingRecords.status} IN ('PENDING', 'OVERDUE')`
        )),
    ]);

    return {
      ...owner,
      campusCount: Number(campusCount?.value ?? 0),
      studentCount: 0, // TODO: aggregate from campuses
      pendingDuesPaise: Number(pendingDues?.value ?? 0),
      lastBillingDate: null, // TODO: get most recent billing record
    } satisfies OwnerRow;
  }));

  return enriched;
}

export async function getOwnerById(ownerId: number): Promise<OwnerRow | null> {
  const [owner] = await db.select().from(owners).where(eq(owners.id, ownerId)).limit(1);
  if (!owner) return null;

  const [[campusCount], [pendingDues]] = await Promise.all([
    db.select({ value: count() }).from(campuses).where(eq(campuses.ownerId, ownerId)),
    db.select({ value: sum(billingRecords.amountPaise) })
      .from(billingRecords)
      .where(and(
        sql`${billingRecords.campusId} IN (SELECT id FROM campuses WHERE owner_id = ${ownerId})`,
        sql`${billingRecords.status} IN ('PENDING', 'OVERDUE')`
      )),
  ]);

  return {
    ...owner,
    campusCount: Number(campusCount?.value ?? 0),
    studentCount: 0,
    pendingDuesPaise: Number(pendingDues?.value ?? 0),
    lastBillingDate: null,
  } satisfies OwnerRow;
}

export async function createOwner(data: {
  name: string;
  email: string;
  phone?: string;
  plan: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
}): Promise<SelectOwner> {
  const [owner] = await db.insert(owners).values({
    name: data.name,
    email: data.email,
    phone: data.phone,
    role: 'owner',
    status: 'ON_TRIAL',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return owner;
}

export async function updateOwnerStatus(
  ownerId: number,
  newStatus: 'ACTIVE' | 'SUSPENDED' | 'ON_TRIAL',
  reason?: string,
  actorId?: number
): Promise<SelectOwner> {
  const [updated] = await db
    .update(owners)
    .set({
      status: newStatus,
      suspendedAt: newStatus === 'SUSPENDED' ? new Date() : null,
      suspendedReason: newStatus === 'SUSPENDED' ? reason : null,
      updatedAt: new Date(),
    })
    .where(eq(owners.id, ownerId))
    .returning();

  if (!updated) throw new AppError('Owner not found', 'OWNER_NOT_FOUND', 404);

  // Log the action
  await auditLogService.log({
    actorId: actorId ?? null,
    actorRole: 'super_admin',
    action: newStatus === 'ACTIVE' ? 'OWNER_REACTIVATED' : 'OWNER_SUSPENDED',
    entityType: 'owner',
    entityId: ownerId,
    targetOwnerId: ownerId,
    metadata: { previousStatus: null, newStatus, reason },
  });

  return updated;
}

// ─── Billing Management ──────────────────────────────────────────────────────

export async function getAllBillingRecords(filter: {
  status?: 'PAID' | 'PENDING' | 'OVERDUE' | 'CANCELLED';
  ownerId?: number;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<{ data: BillingRecordRow[]; total: number }> {
  const conditions: ReturnType<typeof sql>[] = [];

  if (filter.status) {
    conditions.push(eq(billingRecords.status, filter.status));
  }
  if (filter.ownerId) {
    conditions.push(sql`EXISTS (SELECT 1 FROM campuses WHERE campuses.id = ${billingRecords.campusId} AND campuses.owner_id = ${filter.ownerId})`);
  }

  const offset = ((filter.page ?? 1) - 1) * (filter.pageSize ?? 25);

  const records = await db
    .select({
      id:            billingRecords.id,
      ownerId:       campuses.ownerId,
      campusId:      billingRecords.campusId,
      amountPaise:   billingRecords.amountPaise,
      status:        billingRecords.status,
      billingMonth:  billingRecords.billingMonth,
      billingYear:   billingRecords.billingYear,
      dueDate:       billingRecords.dueDate,
      paidAt:        billingRecords.paidAt,
      createdAt:     billingRecords.createdAt,
    })
    .from(billingRecords)
    .innerJoin(campuses, eq(billingRecords.campusId, campuses.id))
    .where(conditions.length > 0 ? and(...conditions) : sql`1=1`)
    .orderBy(desc(billingRecords.createdAt))
    .limit(filter.pageSize ?? 25)
    .offset(offset);

  const [[totalCount]] = await db
    .select({ value: count() })
    .from(billingRecords);

  // Enrich with owner and campus names
  const enriched: BillingRecordRow[] = await Promise.all(
    records.map(async (r) => {
      const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, r.ownerId)).limit(1);
      const [campus] = await db.select({ name: campuses.name }).from(campuses).where(eq(campuses.id, r.campusId)).limit(1);
      return {
        id: r.id,
        ownerId: r.ownerId,
        ownerName: owner?.name ?? 'Unknown',
        campusId: r.campusId,
        campusName: campus?.name ?? 'Unknown',
        amountPaise: r.amountPaise,
        status: r.status,
        billingMonth: r.billingMonth,
        billingYear: r.billingYear,
        dueDate: r.dueDate.toISOString(),
        paidAt: r.paidAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
      } satisfies BillingRecordRow;
    })
  );

  return { data: enriched, total: Number(totalCount?.value ?? 0) };
}

export async function overrideBillingStatus(
  recordId: number,
  newStatus: 'PAID' | 'CANCELLED',
  actorId: number,
  notes?: string
): Promise<BillingRecord> {
  const [updated] = await db
    .update(billingRecords)
    .set({
      status: newStatus,
      paidAt: newStatus === 'PAID' ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(billingRecords.id, recordId))
    .returning();

  if (!updated) throw new AppError('Billing record not found', 'RECORD_NOT_FOUND', 404);

  await auditLogService.log({
    actorId,
    actorRole: 'super_admin',
    action: 'BILLING_OVERRIDE',
    entityType: 'billing_record',
    entityId: recordId,
    metadata: { newStatus, notes, previousStatus: updated.status },
  });

  return updated;
}

// ─── System Health ─────────────────────────────────────────────────────────────

export async function getSystemHealth(): Promise<SystemHealthStatus> {
  const start = Date.now();
  await db.execute(sql`SELECT 1`);
  const dbLatencyMs = Date.now() - start;

  // Storage: use pg_total_relation_size (sum of all tables)
  const [storageResult] = await db
    .select({ value: sql<number>`pg_database_size(current_database())` })
    .from(sql`1=1`);

  return {
    databaseConnected: true,
    databaseLatencyMs: dbLatencyMs,
    storageUsedBytes:   Number(storageResult?.value ?? 0),
    storageTotalBytes:  10 * 1024 * 1024 * 1024, // 10 GB allocated — configurable
    apiLatencyP50Ms:    0, // TODO: implement rolling latency histogram
    apiLatencyP95Ms:    0,
    activeSessions:     0, // TODO: track via Redis or session table
    timestamp:          new Date().toISOString(),
  };
}

// ─── Platform Settings ────────────────────────────────────────────────────────

export async function getPlatformSetting(key: string): Promise<string | null> {
  const [setting] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);
  return setting?.value ?? null;
}

export async function updatePlatformSetting(
  key: string,
  value: unknown,
  updatedBy: number
): Promise<void> {
  await db
    .update(platformSettings)
    .set({ value: value as any, updatedAt: new Date(), updatedBy })
    .where(eq(platformSettings.key, key));

  await auditLogService.log({
    actorId: updatedBy,
    actorRole: 'super_admin',
    action: 'PLATFORM_SETTING_CHANGE',
    entityType: 'platform_setting',
    entityId: null,
    metadata: { key, value },
  });
}
```

### 5.2 `auditLogService.ts`

```typescript
// server/services/auditLogService.ts
import { db } from '../db';
import { auditLogs, type InsertAuditLog } from '../../shared/schema';

export interface AuditLogInput {
  actorId:        number | null;
  actorRole:      string;
  action:         string;
  entityType:     string;
  entityId:       number | null;
  targetOwnerId?: number | null;
  metadata?:      Record<string, unknown>;
  ipAddress?:     string;
  userAgent?:     string;
}

export const auditLogService = {
  async log(input: AuditLogInput): Promise<void> {
    await db.insert(auditLogs).values({
      actorId:       input.actorId ?? null,
      actorRole:     input.actorRole,
      action:        input.action,
      entityType:    input.entityType,
      entityId:      input.entityId ?? null,
      targetOwnerId: input.targetOwnerId ?? null,
      metadata:      (input.metadata ?? {}) as any,
      ipAddress:     input.ipAddress ?? null,
      userAgent:     input.userAgent ?? null,
      createdAt:     new Date(),
    });
    // Fire-and-forget — don't block the caller
    // In production: offload to a background job queue
  },

  async getLogs(filter: {
    action?:        string;
    entityType?:    string;
    actorId?:       number;
    targetOwnerId?: number;
    fromDate?:      string;
    toDate?:        string;
    page?:          number;
    pageSize?:      number;
  } = {}): Promise<{ data: SelectAuditLog[]; total: number }> {
    const conditions: ReturnType<typeof sql>[] = [];
    if (filter.action)       conditions.push(sql`${auditLogs.action} = ${filter.action}`);
    if (filter.entityType)   conditions.push(sql`${auditLogs.entityType} = ${filter.entityType}`);
    if (filter.actorId)      conditions.push(sql`${auditLogs.actorId} = ${filter.actorId}`);
    if (filter.targetOwnerId) conditions.push(sql`${auditLogs.targetOwnerId} = ${filter.targetOwnerId}`);
    if (filter.fromDate)     conditions.push(sql`${auditLogs.createdAt} >= ${filter.fromDate}`);
    if (filter.toDate)       conditions.push(sql`${auditLogs.createdAt} <= ${filter.toDate}`);

    const offset = ((filter.page ?? 1) - 1) * (filter.pageSize ?? 50);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : sql`1=1`)
      .orderBy(desc(auditLogs.createdAt))
      .limit(filter.pageSize ?? 50)
      .offset(offset);

    const [[total]] = await db.select({ value: count() }).from(auditLogs);

    return { data: logs, total: Number(total?.value ?? 0) };
  },
};
```

---

## 6. API & Route Layer

### 6.1 `superAdminRouter.ts`

```typescript
// server/routes/superAdminRouter.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/requireRole';
import * as superAdminService from '../services/superAdminService';
import * as auditLogService from '../services/auditLogService';
import { z } from 'zod';

const router = Router();

// Apply auth + super_admin role guard
router.use(authMiddleware);
router.use(requireRole('super_admin'));

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function actorId(req: Request): number {
  return (req as Request & { user: { id: number } }).user.id;
}

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);
}

// ─── Platform Overview ───────────────────────────────────────────────────────

router.get(
  '/platform-stats',
  asyncHandler(async (req, res) => {
    const stats = await superAdminService.getPlatformStats();
    res.json({ success: true, data: stats });
  })
);

// ─── Owners ───────────────────────────────────────────────────────────────────

const createOwnerSchema = z.object({
  name:  z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().optional(),
  plan:  z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']).default('STARTER'),
});

const updateOwnerStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'ON_TRIAL']),
  reason: z.string().max(500).optional(),
});

router.get(
  '/owners',
  asyncHandler(async (req, res) => {
    const data = await superAdminService.getOwners();
    res.json({ success: true, data });
  })
);

router.get(
  '/owners/:id',
  asyncHandler(async (req, res) => {
    const owner = await superAdminService.getOwnerById(Number(req.params.id));
    if (!owner) { res.status(404).json({ success: false, message: 'Owner not found' }); return; }
    res.json({ success: true, data: owner });
  })
);

router.post(
  '/owners',
  asyncHandler(async (req, res) => {
    const parsed = createOwnerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten() });
      return;
    }
    const owner = await superAdminService.createOwner(parsed.data);
    await auditLogService.log({
      actorId: actorId(req),
      actorRole: 'super_admin',
      action: 'OWNER_CREATED',
      entityType: 'owner',
      entityId: owner.id,
      targetOwnerId: owner.id,
      metadata: { name: parsed.data.name, email: parsed.data.email, plan: parsed.data.plan },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    res.status(201).json({ success: true, data: owner });
  })
);

router.patch(
  '/owners/:id/status',
  asyncHandler(async (req, res) => {
    const parsed = updateOwnerStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten() });
      return;
    }
    const owner = await superAdminService.updateOwnerStatus(
      Number(req.params.id),
      parsed.data.status,
      parsed.data.reason,
      actorId(req)
    );
    res.json({ success: true, data: owner });
  })
);

router.get(
  '/owners/:id/campuses',
  asyncHandler(async (req, res) => {
    const campuses = await db.select().from(campuses)
      .where(eq(campuses.ownerId, Number(req.params.id)));
    res.json({ success: true, data: campuses });
  })
);

// ─── Billing ──────────────────────────────────────────────────────────────────

router.get(
  '/billing',
  asyncHandler(async (req, res) => {
    const rawStatus = req.query['status'];
    const status = typeof rawStatus === 'string'
      ? (['PAID', 'PENDING', 'OVERDUE', 'CANCELLED'].includes(rawStatus) ? rawStatus as any : undefined)
      : undefined;

    const result = await superAdminService.getAllBillingRecords({
      status,
      ownerId: req.query['ownerId'] ? Number(req.query['ownerId']) : undefined,
      fromDate: req.query['from'] as string,
      toDate: req.query['to'] as string,
      page: req.query['page'] ? Number(req.query['page']) : 1,
      pageSize: req.query['pageSize'] ? Number(req.query['pageSize']) : 25,
    });
    res.json({ success: true, ...result });
  })
);

router.patch(
  '/billing/:id/status',
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      status: z.enum(['PAID', 'CANCELLED']),
      notes: z.string().max(500).optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten() });
      return;
    }
    const record = await superAdminService.overrideBillingStatus(
      Number(req.params.id),
      parsed.data.status,
      actorId(req),
      parsed.data.notes
    );
    res.json({ success: true, data: record });
  })
);

// ─── Audit Logs ───────────────────────────────────────────────────────────────

router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const result = await auditLogService.getLogs({
      action: req.query['action'] as string,
      entityType: req.query['entityType'] as string,
      actorId: req.query['actorId'] ? Number(req.query['actorId']) : undefined,
      targetOwnerId: req.query['targetOwnerId'] ? Number(req.query['targetOwnerId']) : undefined,
      fromDate: req.query['from'] as string,
      toDate: req.query['to'] as string,
      page: req.query['page'] ? Number(req.query['page']) : 1,
      pageSize: req.query['pageSize'] ? Number(req.query['pageSize']) : 50,
    });
    res.json({ success: true, ...result });
  })
);

// ─── System Health ────────────────────────────────────────────────────────────

router.get(
  '/system-health',
  asyncHandler(async (req, res) => {
    const health = await superAdminService.getSystemHealth();
    res.json({ success: true, data: health });
  })
);

// ─── Impersonation ───────────────────────────────────────────────────────────

router.post(
  '/impersonate',
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      targetUserId:   z.number().int().positive(),
      targetRole:     z.enum(['owner', 'admin']),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten() });
      return;
    }
    // See §12 for full implementation
    const token = await startImpersonation(actorId(req), parsed.data.targetUserId, parsed.data.targetRole);
    await auditLogService.log({
      actorId: actorId(req),
      actorRole: 'super_admin',
      action: 'IMPERSONATION_START',
      entityType: 'user',
      entityId: parsed.data.targetUserId,
      targetOwnerId: parsed.data.targetRole === 'owner' ? parsed.data.targetUserId : undefined,
      metadata: { targetRole: parsed.data.targetRole },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    res.json({ success: true, data: { impersonationToken: token } });
  })
);

router.post(
  '/end-impersonation',
  asyncHandler(async (req, res) => {
    await endImpersonation(actorId(req));
    res.json({ success: true });
  })
);

// ─── Platform Settings ───────────────────────────────────────────────────────

router.get(
  '/platform-settings',
  asyncHandler(async (req, res) => {
    const settings = await db.select().from(platformSettings);
    res.json({ success: true, data: settings });
  })
);

router.patch(
  '/platform-settings/:key',
  asyncHandler(async (req, res) => {
    const { key } = req.params;
    const { value } = req.body;
    await superAdminService.updatePlatformSetting(key, value, actorId(req));
    res.json({ success: true });
  })
);

export default router;
```

### 6.2 Mount in `app.ts`

```typescript
// server/app.ts — add alongside existing routes
import superAdminRouter from './routes/superAdminRouter';
app.use('/api/super-admin', superAdminRouter);
```

---

## 7. Security Architecture

### 7.1 Role Addition

Extend the `requireRole` middleware to include `'super_admin'`:

```typescript
// server/middleware/requireRole.ts
type Role = 'super_admin' | 'owner' | 'admin' | 'teacher' | 'parent';
```

### 7.2 Impersonation Security

Impersonation creates a **delegation token** with:
1. Original Super Admin identity preserved in `req.originalUser`
2. Impersonation token contains: `targetUserId`, `targetRole`, `originalUserId`, `expiresAt`
3. Token passed via `X-Impersonation-Token` header
4. All actions during impersonation are logged with `actorRole: 'super_admin'` (not impersonated role)
5. Token expires after configurable duration (default: 60 minutes)
6. Impersonation cannot be nested (cannot impersonate while already impersonating)

### 7.3 Data Isolation Rules

| Rule | Enforcement Point |
|------|-------------------|
| Super Admin CAN see all owners/campuses | `superAdminService.ts` — no `WHERE owner_id` filter |
| Super Admin CANNOT be impersonated | Impersonation restricted to `owner` and `admin` roles only |
| Billing overrides are logged | `overrideBillingStatus()` always calls `auditLogService.log()` before returning |
| Service suspension is immediate | `updateOwnerStatus()` updates DB; `serviceSuspensionMiddleware` checks on every request |
| Audit logs are append-only | No `DELETE` route for `audit_logs` table |

### 7.4 Impersonation Middleware

```typescript
// server/middleware/impersonationMiddleware.ts
import { Request, Response, NextFunction } from 'express';

declare module 'express' {
  interface Request {
    originalUser?: { id: number; role: string };
    impersonationToken?: string;
  }
}

export function impersonationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.headers['x-impersonation-token'] as string | undefined;
  if (!token) { next(); return; }

  try {
    const decoded = verifyImpersonationToken(token);
    if (decoded.expiresAt < Date.now()) {
      res.status(401).json({ success: false, message: 'Impersonation session expired' });
      return;
    }
    // Preserve original user for audit logging
    req.originalUser = req.user;
    req.user = { id: decoded.targetUserId, role: decoded.targetRole };
    req.impersonationToken = token;
  } catch {
    res.status(401).json({ success: false, message: 'Invalid impersonation token' });
    return;
  }
  next();
}
```

---

## 8. Frontend Implementation

### 8.1 Routing (`client/src/App.tsx`)

```tsx
// Add inside authenticated routes block
<Route path="/super-admin" element={<SuperAdminLayout />}>
  <Route index element={<Navigate to="overview" replace />} />
  <Route path="overview"  element={<PlatformOverviewPage />} />
  <Route path="owners"    element={<OwnersPage />} />
  <Route path="billing"  element={<PlatformBillingPage />} />
  <Route path="audit-logs" element={<AuditLogsPage />} />
  <Route path="system-health" element={<SystemHealthPage />} />
  <Route path="settings" element={<PlatformSettingsPage />} />
</Route>
```

### 8.2 Sidebar Integration

Add a `superAdminSections` block in `app-sidebar.tsx` under a new top-level section:

```tsx
// Add to imports
import { Shield, Eye } from 'lucide-react';

// New sections array (rendered conditionally for super_admin role)
const superAdminSections: SidebarSection[] = [
  {
    label: "Platform",
    items: [
      { title: "Overview", url: "/super-admin/overview", icon: LayoutDashboard },
      { title: "Owners", url: "/super-admin/owners", icon: Building2 },
      { title: "Billing", url: "/super-admin/billing", icon: CreditCard },
      { title: "Audit Logs", url: "/super-admin/audit-logs", icon: ClipboardList },
      { title: "System Health", url: "/super-admin/system-health", icon: Activity },
      { title: "Settings", url: "/super-admin/settings", icon: Settings2 },
    ],
  },
];

// In AppSidebar component:
const isSuperAdmin = user?.role === 'super_admin';
const sections = isSuperAdmin
  ? [...superAdminSections, ...adminSections]
  : adminSections;
```

> **Note:** `superAdminSections` is prepended so it appears first in the sidebar for Super Admins.

### 8.3 `SuperAdminLayout.tsx`

Follows the same secondary-sidebar pattern as `MySchoolLayout`:

```tsx
// client/src/pages/super-admin/SuperAdminLayout.tsx
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard, Building2, CreditCard, ClipboardList,
  Activity, Settings2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: 'overview',   label: 'Overview',    Icon: LayoutDashboard },
  { to: 'owners',     label: 'Owners',       Icon: Building2 },
  { to: 'billing',    label: 'Billing',      Icon: CreditCard },
  { to: 'audit-logs', label: 'Audit Logs',   Icon: ClipboardList },
  { to: 'system-health', label: 'Health',   Icon: Activity },
  { to: 'settings',   label: 'Settings',     Icon: Settings2 },
] as const;

export default function SuperAdminLayout() {
  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-900 p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Platform
        </p>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-6 bg-slate-50">
        <Outlet />
      </main>
    </div>
  );
}
```

### 8.4 `PlatformStatCards.tsx`

Follows `StatCard.tsx` from `implement_plan_myschool.md §7.4`:

```tsx
// client/src/pages/super-admin/overview/PlatformStatCards.tsx
import { TrendingUp, TrendingDown, Building2, Users, CreditCard, AlertTriangle } from 'lucide-react';

interface PlatformStatCard {
  label: string;
  value: string | number;
  Icon: typeof Building2;
  colorClass: string;
  trend?: { value: number; label: string };
}

export function PlatformStatCards({ stats }: { stats: PlatformStats }) {
  const cards: PlatformStatCard[] = [
    { label: 'Total Schools', value: stats.totalOwners, Icon: Building2, colorClass: 'bg-blue-50 text-blue-700' },
    { label: 'Total Campuses', value: stats.totalCampuses, Icon: Building2, colorClass: 'bg-indigo-50 text-indigo-700' },
    { label: 'Total Students', value: stats.totalStudents.toLocaleString(), Icon: Users, colorClass: 'bg-teal-50 text-teal-700' },
    { label: 'Platform Revenue', value: formatPKR(stats.totalRevenuePaise), Icon: TrendingUp, colorClass: 'bg-emerald-50 text-emerald-700' },
    { label: 'Pending Dues', value: formatPKR(stats.totalPendingDuesPaise), Icon: AlertTriangle, colorClass: 'bg-amber-50 text-amber-700' },
    { label: 'Suspended Schools', value: stats.suspendedSchools, Icon: AlertTriangle, colorClass: 'bg-red-50 text-red-700' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map(card => (
        <div key={card.label} className={cn('rounded-2xl p-5', card.colorClass)}>
          <card.Icon className="mb-3 h-7 w-7 opacity-70" />
          <p className="text-sm font-medium opacity-80">{card.label}</p>
          <p className="text-2xl font-bold">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
```

### 8.5 `OwnerStatusBadge.tsx`

```tsx
// client/src/components/super-admin/OwnerStatusBadge.tsx
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE:     { label: 'ACTIVE',     className: 'bg-emerald-100 text-emerald-700' },
  SUSPENDED:  { label: 'SUSPENDED',  className: 'bg-red-100 text-red-700' },
  ON_TRIAL:   { label: 'ON TRIAL',  className: 'bg-amber-100 text-amber-700' },
  CANCELLED:  { label: 'CANCELLED', className: 'bg-slate-100 text-slate-500' },
};

export function OwnerStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG['ACTIVE'];
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', config.className)}>
      {config.label}
    </span>
  );
}
```

### 8.6 React Query Hooks

```typescript
// client/src/hooks/super-admin/usePlatformStats.ts
import { useQuery } from '@tanstack/react-query';
import { superAdminApi } from '@/lib/api/superAdminApi';

export function usePlatformStats() {
  return useQuery<PlatformStats>({
    queryKey: ['super-admin', 'platform-stats'],
    queryFn: () => superAdminApi.getPlatformStats(),
    staleTime: 60_000, // 1 minute — platform stats don't change every second
  });
}

// client/src/hooks/super-admin/useImpersonation.ts
import { useMutation } from '@tanstack/react-query';
import { superAdminApi } from '@/lib/api/superAdminApi';

export function useImpersonate() {
  return useMutation({
    mutationFn: ({ targetUserId, targetRole }: { targetUserId: number; targetRole: 'owner' | 'admin' }) =>
      superAdminApi.impersonate(targetUserId, targetRole),
    onSuccess: (data) => {
      // Store token in memory (NOT localStorage — security)
      // Redirect to the target role's dashboard
    },
  });
}
```

### 8.7 `superAdminApi.ts`

```typescript
// client/src/lib/api/superAdminApi.ts
import axios from '@/lib/axiosInstance';

export const superAdminApi = {
  getPlatformStats:   () => axios.get('/api/super-admin/platform-stats').then(r => r.data.data),
  getOwners:          () => axios.get('/api/super-admin/owners').then(r => r.data.data),
  getOwner:           (id: number) => axios.get(`/api/super-admin/owners/${id}`).then(r => r.data.data),
  createOwner:        (data: unknown) => axios.post('/api/super-admin/owners', data).then(r => r.data.data),
  updateOwnerStatus:  (id: number, data: unknown) => axios.patch(`/api/super-admin/owners/${id}/status`, data).then(r => r.data.data),
  getBilling:         (params?: Record<string, unknown>) => axios.get('/api/super-admin/billing', { params }).then(r => r.data),
  overrideBilling:    (id: number, data: unknown) => axios.patch(`/api/super-admin/billing/${id}/status`, data).then(r => r.data.data),
  getAuditLogs:       (params?: Record<string, unknown>) => axios.get('/api/super-admin/audit-logs', { params }).then(r => r.data),
  getSystemHealth:    () => axios.get('/api/super-admin/system-health').then(r => r.data.data),
  getSettings:        () => axios.get('/api/super-admin/platform-settings').then(r => r.data.data),
  updateSetting:      (key: string, value: unknown) => axios.patch(`/api/super-admin/platform-settings/${key}`, { value }).then(r => r.data),
  impersonate:        (targetUserId: number, targetRole: string) => axios.post('/api/super-admin/impersonate', { targetUserId, targetRole }).then(r => r.data.data),
  endImpersonation:   () => axios.post('/api/super-admin/end-impersonation'),
};
```

---

## 9. Audit Logging System

### 9.1 Auto-Log Middleware

```typescript
// server/middleware/auditLogMiddleware.ts
import { Request, Response, NextFunction } from 'express';

const SENSITIVE_ROUTES = [
  { method: 'PATCH', path: '/api/super-admin/owners/:id/status', action: 'OWNER_SUSPEND_REACTIVATE' },
  { method: 'PATCH', path: '/api/super-admin/billing/:id/status', action: 'BILLING_OVERRIDE' },
  { method: 'POST', path: '/api/super-admin/impersonate', action: 'IMPERSONATION_START' },
  { method: 'POST', path: '/api/super-admin/end-impersonation', action: 'IMPERSONATION_END' },
  { method: 'PATCH', path: '/api/super-admin/platform-settings/:key', action: 'PLATFORM_SETTING_CHANGE' },
  { method: 'DELETE', path: '/api/super-admin/owners/:id', action: 'OWNER_DELETED' },
];

export function auditLogMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.on('finish', async () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      const matched = SENSITIVE_ROUTES.find(r =>
        r.method === req.method && req.path.startsWith(r.path.replace(/:[^/]+/g, '_'))
      );
      if (matched) {
        // Fire-and-forget — don't slow down the response
        auditLogService.log({
          actorId: (req as Request & { user: { id: number } }).user?.id ?? null,
          actorRole: 'super_admin',
          action: matched.action,
          entityType: 'unknown',
          entityId: null,
          metadata: { method: req.method, path: req.path, statusCode: res.statusCode },
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? undefined,
        }).catch(console.error);
      }
    }
  });
  next();
}
```

### 9.2 Audit Log Frontend

The `AuditLogsPage` displays:
- Filterable by: action type, entity type, actor, target owner, date range
- Columns: Timestamp, Actor, Action, Entity Type, Target, IP Address
- Expandable rows showing full `metadata` JSON
- Pagination: 50 rows per page

---

## 10. Service Suspension Middleware

### 10.1 Auto-Suspension Job

```typescript
// server/services/serviceSuspensionService.ts
import { db } from '../db';
import { owners, billingRecords, campuses, platformSettings } from '../../shared/schema';
import { auditLogService } from './auditLogService';
import { sql, lt, lt as lessThan } from 'drizzle-orm';

export async function checkAndSuspendOverdueOwners(): Promise<{
  suspendedCount: number;
  warningsSent: number;
}> {
  // Get grace period from platform settings
  const [setting] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(sql`${platformSettings.key} = 'grace_period_days'`)
    .limit(1);

  const graceDays = Number(setting?.value ?? 30);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - graceDays);

  // Find owners with OVERDUE billing records past grace period
  const overdueOwners = await db
    .selectDistinct({ ownerId: campuses.ownerId })
    .from(billingRecords)
    .innerJoin(campuses, eq(billingRecords.campusId, campuses.id))
    .innerJoin(owners, eq(campuses.ownerId, owners.id))
    .where(and(
      eq(billingRecords.status, 'OVERDUE'),
      lt(billingRecords.dueDate, cutoffDate),
      eq(owners.status, 'ACTIVE') // Only suspend currently active owners
    ));

  let suspendedCount = 0;
  for (const { ownerId } of overdueOwners) {
    await db
      .update(owners)
      .set({ status: 'SUSPENDED', suspendedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(owners.id, ownerId), eq(owners.status, 'ACTIVE')));

    await auditLogService.log({
      actorId: null,
      actorRole: 'system',
      action: 'SERVICE_SUSPEND',
      entityType: 'owner',
      entityId: ownerId,
      targetOwnerId: ownerId,
      metadata: { trigger: 'payment_overdue', graceDays, cutoffDate: cutoffDate.toISOString() },
    });
    suspendedCount++;
  }

  return { suspendedCount, warningsSent: 0 };
}
```

### 10.2 Request-Level Suspension Check

```typescript
// server/middleware/serviceSuspensionMiddleware.ts
import { Request, Response, NextFunction } from 'express';

declare module 'express' {
  interface Request {
    ownerStatusChecked?: boolean;
  }
}

export function serviceSuspensionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip for super_admin, public routes, and auth routes
  const PUBLIC_PATHS = ['/api/auth/', '/api/health', '/api/super-admin/'];
  if (
    req.user?.role === 'super_admin' ||
    req.user?.role === 'system' ||
    PUBLIC_PATHS.some(p => req.path.startsWith(p)) ||
    req.path.startsWith('/api/auth/')
  ) {
    next(); return;
  }

  // Only check owner role — admins/teachers inherit owner status
  if (req.user?.role === 'owner' || req.user?.role === 'admin' || req.user?.role === 'teacher') {
    if (req.ownerStatusChecked) { next(); return; }

    // Defer to async check in the route handler using a flag
    // The actual suspension check is in the auth middleware that loads owner status
    next();
  } else {
    next();
  }
}
```

### 10.3 Payment Required Redirect

```typescript
// client/src/components/super-admin/ServiceSuspensionBanner.tsx
import { AlertTriangle, CreditCard } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function ServiceSuspensionBanner() {
  return (
    <Alert variant="destructive" className="m-4 border-red-500 bg-red-950 text-red-200">
      <AlertTriangle className="h-4 w-4 text-red-400" />
      <AlertTitle className="text-red-300">Service Suspended — Payment Required</AlertTitle>
      <AlertDescription className="mt-1 flex items-center justify-between">
        <span>
          Your access has been temporarily suspended due to an overdue payment.
          Please settle your outstanding balance to continue using the platform.
        </span>
        <Button size="sm" variant="outline" className="border-red-400 text-red-300 hover:bg-red-900">
          <CreditCard className="h-4 w-4 mr-1" />
          Pay Now
        </Button>
      </AlertDescription>
    </Alert>
  );
}
```

---

## 11. JazzCash Platform-Level Integration

### 11.1 Platform Fee Collection Service

```typescript
// server/services/platformBillingService.ts
import { jazzCashService } from './jazzcashService';
import { db } from '../db';
import { billingRecords, owners, campuses } from '../../shared/schema';
import { auditLogService } from './auditLogService';
import { sql, eq, lte } from 'drizzle-orm';

export interface PlatformFeeInput {
  ownerId: number;
  amountPKR: number;
  billingMonth: number;
  billingYear: number;
  initiatedByUserId: number;
  description?: string;
}

/**
 * Generate a platform-level invoice for an owner.
 * Creates a billing record and initiates JazzCash payment.
 */
export async function generatePlatformInvoice(input: PlatformFeeInput): Promise<{
  billingRecordId: number;
  checkoutUrl: string;
  formParams: Record<string, string>;
  txnRefNo: string;
}> {
  // Get the owner's primary campus for the billing record
  const [campus] = await db
    .select({ id: campuses.id })
    .from(campuses)
    .where(eq(campuses.ownerId, input.ownerId))
    .limit(1);

  if (!campus) throw new Error(`Owner ${input.ownerId} has no campuses`);

  // Create billing record
  const [record] = await db
    .insert(billingRecords)
    .values({
      campusId: campus.id,
      amountPaise: Math.round(input.amountPKR * 100),
      status: 'PENDING',
      billingMonth: input.billingMonth,
      billingYear: input.billingYear,
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  // Initiate JazzCash payment
  const jazzResult = await jazzCashService.initiatePayment({
    familyId: 0, // Platform fee — not tied to a family
    amountPKR: input.amountPKR,
    initiatedByUserId: input.initiatedByUserId,
    billReference: `PLAT-${record.id}`,
    description: input.description ?? `Platform Fee — ${getMonthName(input.billingMonth)} ${input.billingYear}`,
  });

  return {
    billingRecordId: record.id,
    checkoutUrl: jazzResult.checkoutUrl,
    formParams: jazzResult.formParams,
    txnRefNo: jazzResult.txnRefNo,
  };
}

/**
 * Monthly cron job: generate invoices for all active owners.
 * Run on the 1st of every month via external cron scheduler.
 */
export async function generateMonthlyPlatformInvoices(): Promise<{
  generated: number;
  errors: { ownerId: number; message: string }[];
}> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Get monthly fee from platform settings
  const [feeSetting] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(sql`${platformSettings.key} = 'monthly_fee_pkr'`)
    .limit(1);

  const monthlyFeePKR = Number(feeSetting?.value ?? 5000);

  const activeOwners = await db
    .select({ id: owners.id })
    .from(owners)
    .where(eq(owners.status, 'ACTIVE'));

  const errors: { ownerId: number; message: string }[] = [];
  let generated = 0;

  for (const owner of activeOwners) {
    try {
      await generatePlatformInvoice({
        ownerId: owner.id,
        amountPKR: monthlyFeePKR,
        billingMonth: month,
        billingYear: year,
        initiatedByUserId: 1, // System user ID
        description: `Monthly Platform Fee — ${getMonthName(month)} ${year}`,
      });
      generated++;
    } catch (err) {
      errors.push({ ownerId: owner.id, message: (err as Error).message });
    }
  }

  return { generated, errors };
}

function getMonthName(month: number): string {
  return ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'][month - 1];
}
```

---

## 12. Impersonation Mode

### 12.1 Token Management

Impersonation uses a **signed JWT** (not stored in DB) containing:

```typescript
interface ImpersonationClaims {
  originalUserId: number;      // The Super Admin performing impersonation
  targetUserId: number;        // The user being impersonated
  targetRole: string;          // 'owner' | 'admin'
  originalRole: string;        // Always 'super_admin'
  expiresAt: number;          // Unix timestamp (ms)
  iat: number;
}
```

### 12.2 `startImpersonation` / `endImpersonation`

```typescript
// server/services/impersonationService.ts
import jwt from 'jsonwebtoken';
import { auditLogService } from './auditLogService';

const IMPERSONATION_SECRET = process.env.IMPERSONATION_JWT_SECRET!;
const DEFAULT_MAX_DURATION_MS = 60 * 60 * 1000; // 60 minutes

export async function startImpersonation(
  originalUserId: number,
  targetUserId: number,
  targetRole: 'owner' | 'admin'
): Promise<string> {
  const maxDurationMs = DEFAULT_MAX_DURATION_MS;

  const token = jwt.sign(
    {
      originalUserId,
      targetUserId,
      targetRole,
      originalRole: 'super_admin',
      expiresAt: Date.now() + maxDurationMs,
      iat: Date.now(),
    } satisfies ImpersonationClaims,
    IMPERSONATION_SECRET,
    { algorithm: 'HS256' }
  );

  await auditLogService.log({
    actorId: originalUserId,
    actorRole: 'super_admin',
    action: 'IMPERSONATION_START',
    entityType: 'user',
    entityId: targetUserId,
    targetOwnerId: targetRole === 'owner' ? targetUserId : undefined,
    metadata: { targetRole, expiresAt: Date.now() + maxDurationMs },
  });

  return token;
}

export async function endImpersonation(
  originalUserId: number
): Promise<void> {
  // No token invalidation needed — token is stateless
  // Logging is done in the route handler
}

export function verifyImpersonationToken(token: string): ImpersonationClaims {
  try {
    const decoded = jwt.verify(token, IMPERSONATION_SECRET) as ImpersonationClaims & jwt.JwtPayload;
    return decoded;
  } catch {
    throw new Error('Invalid or expired impersonation token');
  }
}
```

### 12.3 Impersonation UI

The Super Admin can start impersonation from:
1. **Owner Detail Drawer** — "Impersonate as Owner" button
2. **Owners Table** — Row action menu

The UI shows a sticky amber banner when impersonating:

```tsx
// client/src/components/super-admin/ImpersonationBadge.tsx
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function ImpersonationBanner({ targetName, onEnd }: {
  targetName: string;
  onEnd: () => void;
}) {
  return (
    <Alert className="m-4 border-amber-500 bg-amber-950 text-amber-200 rounded-xl">
      <AlertTriangle className="h-4 w-4 text-amber-400" />
      <AlertTitle className="text-amber-300 font-semibold">
        Impersonating: {targetName}
      </AlertTitle>
      <AlertDescription className="flex items-center justify-between mt-1">
        <span className="text-sm text-amber-300">
          You are viewing the platform as this user. All actions are being logged.
        </span>
        <Button size="sm" variant="outline" onClick={onEnd}
          className="border-amber-400 text-amber-300 hover:bg-amber-900">
          End Impersonation
        </Button>
      </AlertDescription>
    </Alert>
  );
}
```

---

## 13. System Health Monitor

### 13.1 `SystemHealthPage.tsx`

```tsx
// client/src/pages/super-admin/system-health/SystemHealthPage.tsx
import { Activity, Database, HardDrive, Wifi } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSystemHealth } from '@/hooks/super-admin/useSystemHealth';

function HealthCard({ title, value, unit, status, Icon }: {
  title: string; value: string | number; unit?: string; status: 'healthy' | 'warning' | 'critical'; Icon: typeof Activity;
}) {
  const statusColors = {
    healthy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    critical: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <Card className={statusColors[status]}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-5 w-5 opacity-70" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}{unit && <span className="text-sm ml-1 opacity-70">{unit}</span>}</div>
      </CardContent>
    </Card>
  );
}

export default function SystemHealthPage() {
  const { data: health } = useSystemHealth({ refetchInterval: 30_000 }); // Auto-refresh every 30s

  if (!health) return <PageSkeleton />;

  const dbStatus = health.databaseLatencyMs < 200 ? 'healthy' : health.databaseLatencyMs < 500 ? 'warning' : 'critical';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">System Health</h1>
          <p className="text-sm text-slate-500">Real-time platform infrastructure status.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <HealthCard
          title="Database"
          value={health.databaseConnected ? 'Connected' : 'Disconnected'}
          Icon={Database}
          status={health.databaseConnected ? 'healthy' : 'critical'}
        />
        <HealthCard
          title="DB Latency"
          value={health.databaseLatencyMs}
          unit="ms"
          Icon={Database}
          status={dbStatus}
        />
        <HealthCard
          title="Storage Used"
          value={formatBytes(health.storageUsedBytes)}
          Icon={HardDrive}
          status={health.storageUsedBytes / health.storageTotalBytes > 0.8 ? 'warning' : 'healthy'}
        />
        <HealthCard
          title="Active Sessions"
          value={health.activeSessions}
          Icon={Wifi}
          status={health.activeSessions > 100 ? 'warning' : 'healthy'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last Checked</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            {new Date(health.timestamp).toLocaleString('en-PK')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 14. Phase-by-Phase Roadmap

### Phase 1 — Schema & Core Infrastructure ✦ Priority: CRITICAL
**Estimated effort: 1 day**

| Task | Notes |
|------|-------|
| Add `status` column to `owners` table (additive migration only) | `ACTIVE`, `SUSPENDED`, `ON_TRIAL`, `CANCELLED` |
| Create `audit_logs` table in `shared/schema.ts` | As per §3.2 |
| Create `platform_settings` table in `shared/schema.ts` | As per §3.3 |
| Seed initial `platform_settings` rows | 7 settings from §3.3 |
| Update `requireRole` middleware to include `super_admin` | Role enum extension |
| Add `super_admin` to `user.role` enum and seed data | Seed at least one super admin user |

**Quality Gate:** All migrations apply cleanly. `npx tsc --noEmit` passes. Seed data verified in DB.

---

### Phase 2 — Service Layer ✦ Priority: CRITICAL
**Estimated effort: 2 days**

| Task | Notes |
|------|-------|
| Scaffold `superAdminService.ts` with stub returns | Stub `getPlatformStats`, `getOwners`, `getAllBillingRecords` |
| Implement `getPlatformStats` with full aggregation | Wire all counts from DB |
| Implement Owner CRUD with audit logging | `getOwners`, `getOwnerById`, `createOwner`, `updateOwnerStatus` |
| Implement billing management | `getAllBillingRecords`, `overrideBillingStatus` |
| Implement `auditLogService.ts` | Log writer + log reader with filters |
| Implement `systemHealthService.ts` | DB latency, storage, API latency stubs |
| Implement `platformBillingService.ts` | Platform fee invoice generation |
| Implement `impersonationService.ts` | JWT token generation and verification |
| Run `drizzle-kit generate:pg` | Review and apply migration |

**Quality Gate:** All service functions return correct types. IDOR tests pass. Audit logs written for every sensitive operation.

---

### Phase 3 — API Routes ✦ Priority: CRITICAL
**Estimated effort: 1 day**

| Task | Notes |
|------|-------|
| Create `superAdminRouter.ts` | All endpoints from §6 |
| Add Zod validation to every route | Request body + params validation |
| Add `asyncHandler` wrapper to all routes | Error handling — no raw errors to client |
| Mount router in `server/app.ts` | `/api/super-admin` |
| Create `auditLogMiddleware.ts` | Fire-and-forget on sensitive route finish |
| Create `serviceSuspensionMiddleware.ts` | Stub — check owner status on each request |
| Create `impersonationMiddleware.ts` | Parse `X-Impersonation-Token` header |
| Write integration tests for all routes | Supertest + test DB |

**Quality Gate:** All 14 endpoints return correct shapes. 403 for non-super_admin roles. Audit logs verified after sensitive operations. Impersonation token correctly scoped.

---

### Phase 4 — Frontend Shell ✦ Priority: HIGH
**Estimated effort: 2 days**

| Task | Notes |
|------|-------|
| Add `/super-admin/*` routes to `App.tsx` | Behind `ProtectedRoute role="super_admin"` |
| Add Super Admin section to sidebar | `app-sidebar.tsx` — role-gated, prepended |
| Build `SuperAdminLayout.tsx` | Secondary sidebar + outlet |
| Build `superAdminApi.ts` | All 14 endpoints as Axios wrappers |
| Implement React Query hooks (`usePlatformStats`, `useOwners`, `useBilling`, `useAuditLogs`, `useSystemHealth`) | |
| Build `PlatformStatCards.tsx` | 6 cards from §8.4 |
| Skeleton loading states for all pages | Use Shadcn `Skeleton` |

**Quality Gate:** Layout renders correctly on 1280px desktop. Sidebar shows super-admin section only for `role === 'super_admin'`. All hooks have correct `staleTime` values.

---

### Phase 5 — Feature Pages ✦ Priority: HIGH
**Estimated effort: 3 days**

| Task | Notes |
|------|-------|
| **PlatformOverviewPage**: 6 stat cards + `ActiveSchoolsTable` | Table with campus count, pending dues, status |
| **OwnersPage**: `OwnerTable` with search, filter, pagination | Status filter, plan filter |
| **OwnersPage**: `OwnerFormDialog` (create owner) | Zod + React Hook Form |
| **OwnersPage**: `OwnerDetailDrawer` (slide-over) | Campuses list + impersonate button |
| **PlatformBillingPage**: `BillingTable` with All/Paid/Unpaid/Overdue tabs | Pagination (25/page) |
| **PlatformBillingPage**: `BillingOverrideDialog` | Confirm + notes before override |
| **AuditLogsPage**: `AuditLogTable` with filters | Date range, action type, actor |
| **AuditLogsPage**: expandable rows showing metadata JSON | `Collapsible` component |
| **SystemHealthPage**: `HealthCards` + storage bar chart | Real-time refetch every 30s |
| **PlatformSettingsPage**: `SettingField` components per type | Number fields for billing, toggle for toggles |

**Quality Gate:** All CRUD operations reflect via React Query cache invalidation. Override requires typed notes. Date filters work correctly.

---

### Phase 6 — Service Suspension & Auto-Billing ✦ Priority: HIGH
**Estimated effort: 2 days**

| Task | Notes |
|------|-------|
| Implement `checkAndSuspendOverdueOwners()` | Called by external cron on schedule |
| Implement `generateMonthlyPlatformInvoices()` | Cron job — 1st of every month |
| Wire `serviceSuspensionMiddleware` into Express chain | Full check on every authenticated request |
| Build `ServiceSuspensionBanner.tsx` | Shown when user is suspended |
| Wire `Payment Required` redirect to `/billing` page | Client-side check in `useUser` hook |
| Test auto-suspension flow end-to-end | Create OVERDUE record → run job → verify status |

**Quality Gate:** Auto-suspension runs without errors. Banner shown immediately after suspension. Redirect to payment page works.

---

### Phase 7 — JazzCash Platform Billing ✦ Priority: MEDIUM
**Estimated effort: 1 day**

| Task | Notes |
|------|-------|
| Implement `generatePlatformInvoice()` | Creates billing record + JazzCash intent |
| Add route: `POST /api/super-admin/billing/generate-invoice` | Super Admin initiates invoice for owner |
| Build Invoice Generation dialog in `PlatformBillingPage` | Owner selector + amount + month/year |
| Test end-to-end: generate invoice → JazzCash form → callback → status update | |
| Wire JazzCash callback for platform fees | Extend existing callback handler |

**Quality Gate:** Invoice created in DB. JazzCash form opens correctly. Callback updates record to PAID.

---

### Phase 8 — Impersonation Mode ✦ Priority: MEDIUM
**Estimated effort: 1 day**

| Task | Notes |
|------|-------|
| "Impersonate" button in `OwnerDetailDrawer` | Opens confirmation dialog explaining responsibility |
| Store impersonation token in memory (not localStorage) | Use a React context or zustand store |
| Show `ImpersonationBanner` when active | Amber banner, sticky at top of layout |
| `endImpersonation()` call clears token and refreshes page | |
| "Manage" button → navigate as impersonated owner/admin | |
| Log impersonation start/end in audit table | |

**Quality Gate:** Token persists across route navigation. Banner shown on every page while active. Token expires correctly after configured duration.

---

### Phase 9 — Polish & E2E ✦ Priority: MEDIUM
**Estimated effort: 1 day**

| Task | Notes |
|------|-------|
| E2E tests (Playwright): super admin flow — view overview → create owner → suspend owner → check audit log | |
| Accessibility audit (WCAG 2.1 AA) | Color contrast, keyboard nav, ARIA labels |
| Performance: memoize expensive table renders | `React.memo` on `OwnerTable`, `BillingTable` |
| CSV export on `AuditLogsPage` and `BillingTable` | Using existing `downloadCsv` utility |
| Final TypeScript audit | `tsc --noEmit`, zero `any` in new files |

**Quality Gate:** Lighthouse score ≥ 90. E2E suite green. No `any` in `git diff`.

---

## 15. Quality Gates

| Gate | Criteria |
|------|----------|
| **Schema Gate** | Additive migrations only — no column renames or drops on existing tables. `drizzle-kit push:pg` reports zero drift. |
| **API Security Gate** | Non-super_admin → 403. No token → 401. Impersonation token with wrong signature → 401. Expired token → 401. |
| **Audit Gate** | Every `PATCH /owners/:id/status`, `PATCH /billing/:id/status`, `POST /impersonate` creates an audit log row with correct actor. |
| **Suspension Gate** | `updateOwnerStatus('SUSPENDED')` immediately blocks the owner's next request. `serviceSuspensionMiddleware` returns 403 with `{ message: 'Service suspended' }`. |
| **Type Safety Gate** | `tsc --noEmit` exits 0. All new files: zero `any`, explicit return types on all exported functions. |
| **Impersonation Gate** | Super Admin identity preserved in `req.originalUser`. All audit logs use `actorRole: 'super_admin'`. Token stored only in memory. |
| **Billing Gate** | `overrideBillingStatus` always calls `auditLogService.log()` before returning. Notes field required (at least 1 char). |
| **Regression Gate** | All existing routes (`/api/owner/*`, `/api/admin/*`) unaffected by new middleware chain. |
| **JazzCash Gate** | Platform invoice generates correct JazzCash form params. Callback updates billing record to `PAID`. |

---

## Open Questions & Risks

| # | Question / Risk | Suggested Resolution |
|---|---|---|
| 1 | **How to identify super_admin users?** | Add `role: 'super_admin'` to `users` table seed. Only super_admin users have access to `/api/super-admin/*`. |
| 2 | **Auto-suspension cron job** — where does it run? | External scheduler (cron.org, Railway cron) hits `POST /api/super-admin/cron/check-suspensions` with a signed cron secret. |
| 3 | **Storage total bytes** — how to get actual allocated storage? | Use PostgreSQL `pg_database_size()`. For total allocated (disk quota), add a `platform_settings` entry updated manually. |
| 4 | **Impersonation token in memory** — survives page refresh? | No — warn the user. Token is cleared on refresh; must re-impersonate. |
| 5 | **JazzCash platform fees** — does JazzCash MCP support non-family payments? | The current `jazzcashService.ts` is family-wallet-centric. Platform fees may need a separate JazzCash merchant account or a dedicated payment flow. Document as future work. |
| 6 | **API latency histogram** — how to compute P50/P95? | Implement a rolling log in Redis or an in-memory ring buffer. Returns 0 until implemented. |
| 7 | **Active sessions count** — how to track? | Add `lastSeenAt` to `users` table. Count users active in last 5 minutes. Returns 0 until implemented. |

---

*End of implementation plan. This document is the single source of truth for the Super Admin module. All implementation must adhere to the patterns established in `implement_plan_myschool.md`, `ledger_ui_plan.md`, and `implement_plan_exam.md`.*