# Implementation Plan: My School Management Module

**Project:** School-Nexus  
**Module:** My School (Owner Dashboard)  
**Author:** Senior Full-Stack Architect  
**Date:** 2026-05-13  
**Status:** `DRAFT`  
**Stack:** Vite + React 18 · Node.js + Express · Drizzle ORM · PostgreSQL · Shadcn/ui · Tailwind CSS  

---

## Table of Contents

1. [Objective](#1-objective)
2. [Reference UI Analysis](#2-reference-ui-analysis)
3. [Architecture Overview](#3-architecture-overview)
4. [Folder Structure](#4-folder-structure)
5. [Database Schema (Drizzle ORM)](#5-database-schema-drizzle-orm)
6. [API & Service Layer](#6-api--service-layer)
7. [Frontend Implementation](#7-frontend-implementation)
8. [Security & Multi-Tenancy](#8-security--multi-tenancy)
9. [TypeScript Constraints](#9-typescript-constraints)
10. [Phase-by-Phase Roadmap](#10-phase-by-phase-roadmap)
11. [Quality Gates](#11-quality-gates)
12. [Testing Strategy](#12-testing-strategy)
13. [Open Questions & Risks](#13-open-questions--risks)

---

## 1. Objective

Provide **School Owners** with a centralized **"My School"** management hub inside School-Nexus. The module must:

- Aggregate analytics across all campuses owned by a single owner (students, staff, revenue, pending dues).
- Offer a full **CRUD interface** to manage campus branches/locations.
- Surface **subscription billing** history and unpaid invoice management.
- Enforce strict **multi-tenant data isolation** so each owner sees only their own data.
- Mirror the production UX patterns observed at `schooliee.com/owner/campuses/` while conforming to the School-Nexus "Slate-First" design language.

---

## 2. Reference UI Analysis

The following panels were reverse-engineered from the provided screenshots:

### 2.1 Overview Panel
| Metric Card | Value (example) | Color Token |
|---|---|---|
| Campuses | 2 | Blue-50 bg |
| Students | 276 | Teal-50 bg |
| Staff | 24 | Purple-50 bg |
| Families | 211 | Amber-50 bg |
| Income | 479,964 PKR | Green-50 bg |
| Expenses | 774,719 PKR | Orange-50 bg |
| Total Pending Dues | 6,389,623 PKR | Red-50 bg |

- **Payment Due Banner**: Alert stripe (`warning` variant) shown when `pendingMonths > 0`.
- **Campus Performance Over Time**: Line/Bar chart (Income vs Expense toggle).
- **Top Campuses by Revenue**: Ranked list with campus avatar and revenue figure.

### 2.2 Campuses Panel
| Column | Notes |
|---|---|
| Campus Name + Logo | Avatar image + name + subdomain label |
| Students | Count |
| Staff | Count |
| Families | Count |
| Income | Green text |
| Expenses | Red text |
| Pending Dues | Orange text |
| Status | `ACTIVE` / `INACTIVE` badge |
| Actions | "Manage" button → deep-link to campus detail |

- Date-range filter (Start Date / End Date) scopes all financial figures.
- Campus dropdown filters table to a single campus.

### 2.3 Billing Panel
| Element | Detail |
|---|---|
| Total Paid Card | Sum of all `PAID` records |
| Platform Pending Card | Sum of all `PENDING` records |
| Invoice Table | Month, Year, Amount, Status (`PAID`/`PENDING`), Date |
| Tabs | All · Paid · Unpaid (with count badges) |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (Vite/React)                │
│  /my-school/*  ──→  MySchoolLayout                       │
│    ├── /overview    OverviewPage                         │
│    ├── /campuses    CampusesPage                         │
│    └── /billing     BillingPage                          │
└───────────────────┬─────────────────────────────────────┘
                    │ REST (Axios + React Query)
┌───────────────────▼─────────────────────────────────────┐
│              BACKEND (Express + Drizzle ORM)             │
│  /api/owner/*  ──→  ownerRouter                          │
│    ├── GET  /overview                                    │
│    ├── GET  /campuses                                    │
│    ├── POST /campuses                                    │
│    ├── PATCH /campuses/:id                               │
│    ├── DELETE /campuses/:id                              │
│    └── GET  /billing                                     │
│                                                          │
│  Middleware:  authMiddleware → requireRole('owner')      │
│  Service:     server/services/schoolService.ts           │
└───────────────────┬─────────────────────────────────────┘
                    │ Drizzle ORM queries
┌───────────────────▼─────────────────────────────────────┐
│                   PostgreSQL                             │
│  tables: campuses, billing_records, users (existing)     │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Folder Structure

```
school-nexus/
├── client/
│   └── src/
│       ├── pages/
│       │   └── my-school/
│       │       ├── MySchoolLayout.tsx          # Secondary sidebar + outlet
│       │       ├── overview/
│       │       │   ├── OverviewPage.tsx
│       │       │   ├── StatCard.tsx
│       │       │   ├── PerformanceChart.tsx
│       │       │   └── TopCampusesList.tsx
│       │       ├── campuses/
│       │       │   ├── CampusesPage.tsx
│       │       │   ├── CampusTable.tsx
│       │       │   ├── CampusFormDialog.tsx    # Create / Edit modal
│       │       │   └── CampusFilters.tsx
│       │       └── billing/
│       │           ├── BillingPage.tsx
│       │           ├── InvoiceTable.tsx
│       │           └── BillingSummaryCards.tsx
│       ├── components/
│       │   └── my-school/
│       │       ├── PaymentDueBanner.tsx
│       │       └── CampusStatusBadge.tsx
│       ├── hooks/
│       │   └── my-school/
│       │       ├── useOverview.ts
│       │       ├── useCampuses.ts
│       │       └── useBilling.ts
│       └── lib/
│           └── api/
│               └── mySchoolApi.ts              # Axios call wrappers
│
└── server/
    ├── routes/
    │   └── ownerRouter.ts                      # Mounts at /api/owner
    ├── services/
    │   └── schoolService.ts                    # All DB logic lives here
    ├── middleware/
    │   ├── authMiddleware.ts                   # JWT verify (existing)
    │   └── requireRole.ts                      # Role-guard middleware
    └── db/
        └── schema/
            ├── campuses.ts                     # NEW
            ├── billingRecords.ts               # NEW
            └── index.ts                        # Re-export barrel (update)
```

---

## 5. Database Schema (Drizzle ORM)

### 5.1 `campuses` Table

```typescript
// server/db/schema/campuses.ts
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const campuses = pgTable('campuses', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  subdomain: varchar('subdomain', { length: 60 }).notNull().unique(),
  address: text('address').notNull(),
  contactInfo: jsonb('contact_info')
    .$type<{ phone: string; email: string }>()
    .notNull(),
  logoUrl: varchar('logo_url', { length: 500 }),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Campus = typeof campuses.$inferSelect;
export type NewCampus = typeof campuses.$inferInsert;
```

### 5.2 `billing_records` Table

```typescript
// server/db/schema/billingRecords.ts
import {
  pgTable,
  uuid,
  integer,
  varchar,
  pgEnum,
  timestamp,
  date,
} from 'drizzle-orm/pg-core';
import { campuses } from './campuses';

export const billingStatusEnum = pgEnum('billing_status', [
  'PAID',
  'PENDING',
  'OVERDUE',
  'CANCELLED',
]);

export const billingRecords = pgTable('billing_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  campusId: uuid('campus_id')
    .notNull()
    .references(() => campuses.id, { onDelete: 'cascade' }),
  amountPaise: integer('amount_paise').notNull(), // store in smallest unit (paisa)
  currency: varchar('currency', { length: 3 }).notNull().default('PKR'),
  status: billingStatusEnum('status').notNull().default('PENDING'),
  billingMonth: integer('billing_month').notNull(), // 1–12
  billingYear: integer('billing_year').notNull(),
  dueDate: date('due_date').notNull(),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type BillingRecord = typeof billingRecords.$inferSelect;
export type NewBillingRecord = typeof billingRecords.$inferInsert;
```

### 5.3 Migration Notes

```bash
# Generate migration after adding new schema files
npx drizzle-kit generate:pg --schema=server/db/schema

# Apply migration
npx drizzle-kit push:pg
```

- Update `server/db/schema/index.ts` to re-export `campuses` and `billingRecords`.
- **Existing tables** (`students`, `staff`, `families`, `income_records`, `expense_records`) must gain a `campus_id uuid NOT NULL REFERENCES campuses(id)` FK column via additive migration. Never alter existing column names.

---

## 6. API & Service Layer

### 6.1 `schoolService.ts`

```typescript
// server/services/schoolService.ts
import { db } from '../db';
import { campuses, NewCampus, Campus } from '../db/schema/campuses';
import { billingRecords, BillingRecord } from '../db/schema/billingRecords';
import { eq, and, sql, gte, lte, sum, count } from 'drizzle-orm';
import { students } from '../db/schema/students';
import { staff } from '../db/schema/staff';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OverviewStats {
  totalCampuses: number;
  totalStudents: number;
  totalStaff: number;
  totalFamilies: number;
  totalIncomePaise: number;
  totalExpensesPaise: number;
  totalPendingDuesPaise: number;
  pendingBillingMonths: number;
}

export interface CampusRow extends Campus {
  studentCount: number;
  staffCount: number;
  familyCount: number;
  incomePaise: number;
  expensesPaise: number;
  pendingDuesPaise: number;
}

export interface BillingFilter {
  status?: 'PAID' | 'PENDING' | 'OVERDUE' | 'CANCELLED';
}

// ─── Campus CRUD ──────────────────────────────────────────────────────────────

export async function getCampusesByOwner(ownerId: string): Promise<CampusRow[]> {
  const rows = await db
    .select()
    .from(campuses)
    .where(eq(campuses.ownerId, ownerId));

  // Aggregate per-campus metrics in parallel
  const enriched = await Promise.all(
    rows.map(async (campus) => {
      const [studentCount] = await db
        .select({ value: count() })
        .from(students)
        .where(eq(students.campusId, campus.id));

      const [staffCount] = await db
        .select({ value: count() })
        .from(staff)
        .where(eq(staff.campusId, campus.id));

      // families, income, expenses, pendingDues: analogous queries omitted for brevity
      return {
        ...campus,
        studentCount: Number(studentCount.value),
        staffCount: Number(staffCount.value),
        familyCount: 0,      // TODO: wire families table
        incomePaise: 0,       // TODO: wire income_records
        expensesPaise: 0,     // TODO: wire expense_records
        pendingDuesPaise: 0,  // TODO: wire fee_dues
      } satisfies CampusRow;
    })
  );

  return enriched;
}

export async function createCampus(
  ownerId: string,
  data: Omit<NewCampus, 'ownerId'>
): Promise<Campus> {
  const [row] = await db
    .insert(campuses)
    .values({ ...data, ownerId })
    .returning();
  return row;
}

export async function updateCampus(
  ownerId: string,
  campusId: string,
  data: Partial<Omit<NewCampus, 'ownerId' | 'id'>>
): Promise<Campus> {
  const [row] = await db
    .update(campuses)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(campuses.id, campusId), eq(campuses.ownerId, ownerId)))
    .returning();
  if (!row) throw new Error('Campus not found or access denied');
  return row;
}

export async function deleteCampus(
  ownerId: string,
  campusId: string
): Promise<void> {
  const result = await db
    .delete(campuses)
    .where(and(eq(campuses.id, campusId), eq(campuses.ownerId, ownerId)))
    .returning({ id: campuses.id });
  if (result.length === 0) throw new Error('Campus not found or access denied');
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export async function getOwnerOverview(ownerId: string): Promise<OverviewStats> {
  const ownerCampuses = await db
    .select({ id: campuses.id })
    .from(campuses)
    .where(eq(campuses.ownerId, ownerId));

  const campusIds = ownerCampuses.map((c) => c.id);

  const [pendingCount] = await db
    .select({ value: count() })
    .from(billingRecords)
    .where(
      and(
        sql`${billingRecords.campusId} = ANY(${campusIds})`,
        eq(billingRecords.status, 'PENDING')
      )
    );

  return {
    totalCampuses: campusIds.length,
    totalStudents: 0,       // TODO: aggregate via campusIds
    totalStaff: 0,
    totalFamilies: 0,
    totalIncomePaise: 0,
    totalExpensesPaise: 0,
    totalPendingDuesPaise: 0,
    pendingBillingMonths: Number(pendingCount.value),
  };
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export async function getBillingByOwner(
  ownerId: string,
  filter: BillingFilter = {}
): Promise<BillingRecord[]> {
  const ownerCampuses = await db
    .select({ id: campuses.id })
    .from(campuses)
    .where(eq(campuses.ownerId, ownerId));

  const campusIds = ownerCampuses.map((c) => c.id);
  if (campusIds.length === 0) return [];

  const conditions = [
    sql`${billingRecords.campusId} = ANY(${campusIds})`,
    ...(filter.status ? [eq(billingRecords.status, filter.status)] : []),
  ];

  return db
    .select()
    .from(billingRecords)
    .where(and(...conditions))
    .orderBy(sql`${billingRecords.billingYear} DESC, ${billingRecords.billingMonth} DESC`);
}
```

### 6.2 `ownerRouter.ts`

```typescript
// server/routes/ownerRouter.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { requireRole } from '../middleware/requireRole';
import * as schoolService from '../services/schoolService';
import { z } from 'zod';

const router = Router();

// Apply auth + role guard to every route in this file
router.use(authMiddleware);
router.use(requireRole('owner'));

// ─── Helper ───────────────────────────────────────────────────────────────────

function ownerId(req: Request): string {
  return (req as Request & { user: { id: string } }).user.id;
}

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);
}

// ─── Overview ─────────────────────────────────────────────────────────────────

/**
 * GET /api/owner/overview
 * Returns aggregated stats for all campuses owned by the requester.
 */
router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const stats = await schoolService.getOwnerOverview(ownerId(req));
    res.json({ success: true, data: stats });
  })
);

// ─── Campuses ─────────────────────────────────────────────────────────────────

const createCampusSchema = z.object({
  name: z.string().min(2).max(120),
  subdomain: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/),
  address: z.string().min(5),
  contactInfo: z.object({
    phone: z.string(),
    email: z.string().email(),
  }),
  logoUrl: z.string().url().optional(),
});

const updateCampusSchema = createCampusSchema.partial();

/**
 * GET /api/owner/campuses
 */
router.get(
  '/campuses',
  asyncHandler(async (req, res) => {
    const data = await schoolService.getCampusesByOwner(ownerId(req));
    res.json({ success: true, data });
  })
);

/**
 * POST /api/owner/campuses
 */
router.post(
  '/campuses',
  asyncHandler(async (req, res) => {
    const parsed = createCampusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten() });
      return;
    }
    const campus = await schoolService.createCampus(ownerId(req), parsed.data);
    res.status(201).json({ success: true, data: campus });
  })
);

/**
 * PATCH /api/owner/campuses/:id
 */
router.patch(
  '/campuses/:id',
  asyncHandler(async (req, res) => {
    const parsed = updateCampusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten() });
      return;
    }
    const campus = await schoolService.updateCampus(
      ownerId(req),
      req.params.id,
      parsed.data
    );
    res.json({ success: true, data: campus });
  })
);

/**
 * DELETE /api/owner/campuses/:id
 */
router.delete(
  '/campuses/:id',
  asyncHandler(async (req, res) => {
    await schoolService.deleteCampus(ownerId(req), req.params.id);
    res.status(204).end();
  })
);

// ─── Billing ──────────────────────────────────────────────────────────────────

/**
 * GET /api/owner/billing?status=PAID|PENDING|OVERDUE
 */
router.get(
  '/billing',
  asyncHandler(async (req, res) => {
    const rawStatus = req.query['status'];
    const status =
      typeof rawStatus === 'string' &&
      ['PAID', 'PENDING', 'OVERDUE', 'CANCELLED'].includes(rawStatus)
        ? (rawStatus as 'PAID' | 'PENDING' | 'OVERDUE' | 'CANCELLED')
        : undefined;

    const data = await schoolService.getBillingByOwner(ownerId(req), { status });
    res.json({ success: true, data });
  })
);

export default router;
```

### 6.3 Mount in `app.ts`

```typescript
// server/app.ts  (add alongside existing routes)
import ownerRouter from './routes/ownerRouter';
app.use('/api/owner', ownerRouter);
```

---

## 7. Frontend Implementation

### 7.1 Routing (`client/src/App.tsx`)

```tsx
// Add inside the authenticated routes block
<Route path="/my-school" element={<MySchoolLayout />}>
  <Route index element={<Navigate to="overview" replace />} />
  <Route path="overview"  element={<OverviewPage />} />
  <Route path="campuses"  element={<CampusesPage />} />
  <Route path="billing"   element={<BillingPage />}  />
</Route>
```

### 7.2 Sidebar Integration

Add to the **primary sidebar** navigation list (alongside Dashboard, Students, etc.):

```tsx
{
  label: 'My School',
  icon: <Building2 className="h-5 w-5" />,
  href: '/my-school',
  roles: ['owner'],
}
```

Conditionally render this item only when `currentUser.role === 'owner'`.

### 7.3 `MySchoolLayout.tsx`

```tsx
// client/src/pages/my-school/MySchoolLayout.tsx
import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Building2, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: 'overview',  label: 'Overview',  Icon: LayoutDashboard },
  { to: 'campuses',  label: 'Campuses',  Icon: Building2 },
  { to: 'billing',   label: 'Billing',   Icon: CreditCard },
] as const;

export default function MySchoolLayout() {
  return (
    <div className="flex h-full">
      {/* Secondary sidebar */}
      <aside className="w-52 shrink-0 border-r border-slate-800 bg-slate-900 p-4">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Management
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

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

### 7.4 `StatCard.tsx` (shared primitive)

```tsx
// client/src/pages/my-school/overview/StatCard.tsx
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  Icon: LucideIcon;
  colorClass: string; // e.g. 'bg-blue-50 text-blue-700'
}

export function StatCard({ label, value, Icon, colorClass }: StatCardProps) {
  return (
    <div className={cn('rounded-2xl p-5', colorClass)}>
      <Icon className="mb-3 h-7 w-7 opacity-70" />
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
```

### 7.5 `PaymentDueBanner.tsx`

```tsx
// client/src/components/my-school/PaymentDueBanner.tsx
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Props {
  pendingMonths: number;
}

export function PaymentDueBanner({ pendingMonths }: Props) {
  if (pendingMonths === 0) return null;

  return (
    <Alert variant="destructive" className="mb-6 border-amber-500 bg-amber-950 text-amber-200">
      <AlertTriangle className="h-4 w-4 text-amber-400" />
      <AlertTitle className="text-amber-300">Payment Due – Action Required</AlertTitle>
      <AlertDescription>
        Your payment is overdue. You have{' '}
        <strong>{pendingMonths} month(s)</strong> of pending payments. Please settle
        your outstanding dues immediately to continue using the system. Contact support
        if you need assistance with payment.
      </AlertDescription>
    </Alert>
  );
}
```

### 7.6 React Query Hooks

```typescript
// client/src/hooks/my-school/useOverview.ts
import { useQuery } from '@tanstack/react-query';
import { mySchoolApi } from '@/lib/api/mySchoolApi';
import type { OverviewStats } from '@server/services/schoolService';

export function useOverview() {
  return useQuery<OverviewStats>({
    queryKey: ['owner', 'overview'],
    queryFn: () => mySchoolApi.getOverview(),
    staleTime: 30_000,
  });
}
```

```typescript
// client/src/hooks/my-school/useCampuses.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mySchoolApi } from '@/lib/api/mySchoolApi';
import type { CampusRow } from '@server/services/schoolService';

export function useCampuses() {
  return useQuery<CampusRow[]>({
    queryKey: ['owner', 'campuses'],
    queryFn: () => mySchoolApi.getCampuses(),
  });
}

export function useCreateCampus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: mySchoolApi.createCampus,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owner', 'campuses'] }),
  });
}

export function useUpdateCampus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<CampusRow>) =>
      mySchoolApi.updateCampus(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owner', 'campuses'] }),
  });
}

export function useDeleteCampus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: mySchoolApi.deleteCampus,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['owner', 'campuses'] }),
  });
}
```

### 7.7 `mySchoolApi.ts`

```typescript
// client/src/lib/api/mySchoolApi.ts
import axios from '@/lib/axiosInstance'; // existing configured Axios

export const mySchoolApi = {
  getOverview:   () => axios.get('/api/owner/overview').then(r => r.data.data),
  getCampuses:   () => axios.get('/api/owner/campuses').then(r => r.data.data),
  createCampus:  (data: unknown) => axios.post('/api/owner/campuses', data).then(r => r.data.data),
  updateCampus:  (id: string, data: unknown) => axios.patch(`/api/owner/campuses/${id}`, data).then(r => r.data.data),
  deleteCampus:  (id: string) => axios.delete(`/api/owner/campuses/${id}`),
  getBilling:    (status?: string) =>
    axios.get('/api/owner/billing', { params: status ? { status } : undefined }).then(r => r.data.data),
};
```

---

## 8. Security & Multi-Tenancy

### 8.1 `requireRole` Middleware

```typescript
// server/middleware/requireRole.ts
import { Request, Response, NextFunction } from 'express';

type Role = 'owner' | 'admin' | 'teacher' | 'parent';

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: { role: Role } }).user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    next();
  };
}
```

### 8.2 Multi-Tenant Isolation Rules

| Rule | Enforcement Point |
|---|---|
| All DB queries include `WHERE owner_id = :ownerId` | `schoolService.ts` — every exported function accepts `ownerId` as first param |
| Campus delete/update uses `AND owner_id = :ownerId` | Prevents IDOR: even with a valid campus UUID, wrong owner gets 404 |
| Billing records are resolved via campus ownership chain | `getBillingByOwner` fetches campus IDs first, then filters billing |
| No raw `campusId` accepted from request body for ownership-scoped ops | `ownerId` always sourced from `req.user`, never `req.body` |
| Frontend `useOverview` / `useCampuses` hooks carry JWT in Authorization header | Configured globally on `axiosInstance` |

### 8.3 Input Validation

- All request bodies are validated with **Zod** schemas before reaching the service layer.
- UUID path params are validated with `z.string().uuid()` before DB calls.
- Dates and financial amounts are validated server-side; never trust client-side formatting.

---

## 9. TypeScript Constraints

These rules are **non-negotiable** across the entire feature:

| Constraint | Rationale |
|---|---|
| **No `any` types** anywhere | Use `unknown` + type guards or explicit interfaces |
| All Drizzle `$inferSelect` / `$inferInsert` types used as source of truth | Prevents schema drift |
| All API response shapes have explicit `interface` definitions in `shared/types/` | Shared between client and server via path alias |
| React component props must have named `interface Props` | No inline object types on function signatures |
| All async functions have explicit return type annotations | Prevents accidental `Promise<any>` |
| Zod schemas colocated with routes; inferred types used downstream | `z.infer<typeof schema>` instead of duplicating interface |
| No non-null assertions (`!`) except in test files | Use optional chaining + explicit null checks |

---

## 10. Phase-by-Phase Roadmap

### Phase 1 — Database Layer ✦ Priority: CRITICAL
**Estimated effort: 1 day**

| Task | Owner | Notes |
|---|---|---|
| Create `server/db/schema/campuses.ts` | Backend Dev | As per §5.1 |
| Create `server/db/schema/billingRecords.ts` | Backend Dev | As per §5.2 |
| Add `campus_id` FK to `students`, `staff`, `families`, `income_records`, `expense_records` | Backend Dev | Additive migration only; nullable initially |
| Update `server/db/schema/index.ts` barrel | Backend Dev | Export new tables |
| Run `drizzle-kit generate:pg` and review migration SQL | Backend Dev | Peer-review required |
| Apply migration to dev database | Backend Dev | — |
| Seed demo data for `Demo School` campus | Backend Dev | Matches screenshot data |

**Quality Gate:** All existing tests pass after migration. No column renames or drops.

---

### Phase 2 — Backend API ✦ Priority: HIGH
**Estimated effort: 2 days**

| Task | Owner | Notes |
|---|---|---|
| Scaffold `server/services/schoolService.ts` with stub implementations | Backend Dev | Return empty arrays / zeroes |
| Implement `getCampusesByOwner` with full aggregation | Backend Dev | Wire all sub-counts |
| Implement `createCampus`, `updateCampus`, `deleteCampus` | Backend Dev | Include IDOR guard |
| Implement `getOwnerOverview` | Backend Dev | Aggregate across all owner campuses |
| Implement `getBillingByOwner` with status filter | Backend Dev | |
| Create `server/routes/ownerRouter.ts` with Zod validation | Backend Dev | As per §6.2 |
| Mount router in `server/app.ts` | Backend Dev | |
| Create/update `requireRole` middleware | Backend Dev | As per §8.1 |
| Write integration tests for all 6 endpoints | Backend Dev | Use Supertest + test DB |

**Quality Gate:** All 6 endpoints return correct shapes. 403 confirmed for non-owner roles. IDOR test: owner A cannot read/mutate owner B's campuses.

---

### Phase 3 — Frontend Shell ✦ Priority: HIGH
**Estimated effort: 2 days**

| Task | Owner | Notes |
|---|---|---|
| Add `/my-school/*` routes to `App.tsx` | Frontend Dev | Behind `ProtectedRoute role="owner"` |
| Add "My School" item to primary sidebar (owner-only) | Frontend Dev | Lucide `Building2` icon |
| Build `MySchoolLayout.tsx` with secondary sidebar | Frontend Dev | As per §7.3 |
| Build `StatCard.tsx` shared primitive | Frontend Dev | Accessible color tokens |
| Build `PaymentDueBanner.tsx` | Frontend Dev | Conditionally rendered |
| Build `mySchoolApi.ts` Axios wrappers | Frontend Dev | |
| Implement React Query hooks (`useOverview`, `useCampuses`, `useBilling`) | Frontend Dev | |
| Skeleton loading states for all stat cards | Frontend Dev | Use Shadcn `Skeleton` |

**Quality Gate:** Layout renders correctly on 1280px desktop. No console errors. Sidebar item hidden for non-owner roles.

---

### Phase 4 — Feature Pages ✦ Priority: HIGH
**Estimated effort: 3 days**

| Task | Owner | Notes |
|---|---|---|
| **OverviewPage**: render all 7 stat cards with live data | Frontend Dev | |
| **OverviewPage**: `PerformanceChart` (Recharts bar/line, Income/Expense toggle) | Frontend Dev | |
| **OverviewPage**: `TopCampusesList` component | Frontend Dev | |
| **CampusesPage**: campus filter dropdown + date range pickers | Frontend Dev | Shadcn `DatePicker` |
| **CampusesPage**: `CampusTable` with all columns from §2.2 | Frontend Dev | |
| **CampusesPage**: `CampusFormDialog` create/edit modal with Zod + React Hook Form | Frontend Dev | |
| **CampusesPage**: delete confirmation dialog | Frontend Dev | Shadcn `AlertDialog` |
| **BillingPage**: `BillingSummaryCards` (Total Paid, Platform Pending) | Frontend Dev | |
| **BillingPage**: `InvoiceTable` with All/Paid/Unpaid tabs | Frontend Dev | |
| **BillingPage**: `CampusStatusBadge` component (ACTIVE/INACTIVE) | Frontend Dev | |

**Quality Gate:** All CRUD operations reflect immediately via React Query cache invalidation. Empty states displayed when no data. Form validation messages visible.

---

### Phase 5 — Integration & Polish ✦ Priority: MEDIUM
**Estimated effort: 1 day**

| Task | Owner | Notes |
|---|---|---|
| Wire date-range filter on Campuses page to API (query params: `startDate`, `endDate`) | Fullstack | Update service + router |
| Wire campus dropdown filter on Campuses page | Frontend Dev | Filter client-side or via query param |
| "Manage" button on campus row → navigate to existing campus detail route | Frontend Dev | |
| E2E tests (Playwright): owner flow — view overview → create campus → check billing | QA | |
| Accessibility audit (WCAG 2.1 AA): color contrast, keyboard nav, ARIA labels | Frontend Dev | |
| Performance: memoize expensive Recharts renders with `React.memo` | Frontend Dev | |
| Final design QA against screenshots | Designer | |

**Quality Gate:** Lighthouse score ≥ 90 (Performance, Accessibility). E2E suite green. No TypeScript `any` in `git diff main`.

---

## 11. Quality Gates Summary

| Gate | Criteria |
|---|---|
| **Schema Gate** | Migration applies cleanly; `drizzle-kit` reports no drift; existing tests pass |
| **API Security Gate** | Non-owner JWT → 403; No token → 401; IDOR cross-owner test → 404 |
| **Type Safety Gate** | `tsc --noEmit` exits 0; zero `any` in new files; ESLint `@typescript-eslint/no-explicit-any` enabled |
| **Test Coverage Gate** | ≥ 80% line coverage on `schoolService.ts`; all 6 route integration tests green |
| **UI Fidelity Gate** | Visual diff against screenshots: stat card layout, table columns, billing tabs all match |
| **Regression Gate** | Full existing test suite green; no existing routes impacted |
| **Performance Gate** | Overview page FCP < 1.5 s on throttled 4G; no waterfall API calls (parallel fetch) |

---

## 12. Testing Strategy

### Backend

```
server/
└── tests/
    ├── services/
    │   └── schoolService.test.ts    # Unit tests with mocked DB
    └── routes/
        └── ownerRouter.test.ts      # Integration tests (Supertest + test PG)
```

Key test scenarios:

- `getCampusesByOwner`: returns only campuses for the requesting owner
- `createCampus`: validates subdomain uniqueness constraint
- `updateCampus`: returns 404 when campus belongs to different owner (IDOR)
- `deleteCampus`: cascades correctly (verify `billingRecords` deleted too)
- `GET /api/owner/overview`: returns `pendingBillingMonths > 0` when unpaid records exist
- `GET /api/owner/billing?status=PENDING`: returns only PENDING records

### Frontend

```
client/src/
└── __tests__/
    └── my-school/
        ├── OverviewPage.test.tsx     # React Testing Library
        ├── CampusFormDialog.test.tsx # Form validation, submit
        └── BillingPage.test.tsx      # Tab switching, filter
```

### E2E (Playwright)

```
e2e/
└── my-school/
    ├── owner-overview.spec.ts
    ├── campus-crud.spec.ts
    └── billing-view.spec.ts
```

---

## 13. Open Questions & Risks

| # | Question / Risk | Suggested Resolution |
|---|---|---|
| 1 | **Existing campus data**: does the project already have a `campuses` table under a different name? | Audit schema before migration; alias or rename rather than create duplicate |
| 2 | **Currency handling**: screenshots show PKR; is this multi-currency? | Store all amounts in smallest unit (paisa); add `currency` column to billing_records; format in frontend with `Intl.NumberFormat` |
| 3 | **Date-range scoping of financial metrics**: overview shows aggregated PKR — which table(s) source income/expenses? | Define `income_records` / `expense_records` tables in a separate plan; stub returns 0 until ready |
| 4 | **`families` entity**: referenced in stats but no schema defined | Create `families` table in a follow-up ticket; `familyCount` returns 0 until resolved |
| 5 | **Billing auto-generation**: who creates `billing_records` rows monthly? | Likely a cron job / admin action; outside this module's scope — document as future work |
| 6 | **Image upload for campus logo**: `logoUrl` stored as URL, but no upload flow defined | Integrate with existing file-upload service (S3/Cloudflare R2); treat as Phase 6 |
| 7 | **"Manage" campus button destination**: routes to existing per-campus admin? | Confirm destination route with product team before Phase 4 |

---

*End of implementation plan. Next step: schedule architecture review with backend and frontend leads before Phase 1 kick-off.*
