import { db } from "../db.js";
import {
  campuses,
  billingRecords,
  type Campus,
  type NewCampus,
  type BillingRecord,
} from "../../shared/schema.js";
import { eq, and, sql, count } from "drizzle-orm";

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
  status?: "PAID" | "PENDING" | "OVERDUE" | "CANCELLED";
}

export async function getCampusesByOwner(ownerId: number): Promise<CampusRow[]> {
  const rows = await db
    .select()
    .from(campuses)
    .where(eq(campuses.ownerId, ownerId));

  const enriched = await Promise.all(
    rows.map(async (campus) => {
      let studentCount = 0;
      let staffCount = 0;
      let familyCount = 0;
      try {
        const { students } = await import("../../shared/schema.js");
        const [result] = await db
          .select({ value: count() })
          .from(students)
          .where(eq(students.campusId, campus.id));
        studentCount = Number(result?.value ?? 0);
      } catch { /* table may not exist yet */ }

      try {
        const { staff } = await import("../../shared/schema.js");
        const [result] = await db
          .select({ value: count() })
          .from(staff)
          .where(eq(staff.campusId, campus.id));
        staffCount = Number(result?.value ?? 0);
      } catch { /* table may not exist yet */ }

      try {
        const { families } = await import("../../shared/schema.js");
        const [result] = await db
          .select({ value: count() })
          .from(families)
          .where(eq(families.campusId, campus.id));
        familyCount = Number(result?.value ?? 0);
      } catch { /* table may not exist yet */ }

      return {
        ...campus,
        studentCount,
        staffCount,
        familyCount,
        incomePaise: 0,
        expensesPaise: 0,
        pendingDuesPaise: 0,
      } satisfies CampusRow;
    })
  );

  return enriched;
}

export async function createCampus(
  ownerId: number,
  data: Omit<NewCampus, "ownerId">
): Promise<Campus> {
  const [row] = await db
    .insert(campuses)
    .values({ ...data, ownerId } as NewCampus)
    .returning();
  return row;
}

export async function updateCampus(
  ownerId: number,
  campusId: number,
  data: Partial<Omit<NewCampus, "ownerId" | "id">>
): Promise<Campus> {
  const [row] = await db
    .update(campuses)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(campuses.id, campusId), eq(campuses.ownerId, ownerId)))
    .returning();
  if (!row) throw new Error("Campus not found or access denied");
  return row;
}

export async function deleteCampus(
  ownerId: number,
  campusId: number
): Promise<void> {
  const result = await db
    .delete(campuses)
    .where(and(eq(campuses.id, campusId), eq(campuses.ownerId, ownerId)))
    .returning({ id: campuses.id });
  if (result.length === 0) throw new Error("Campus not found or access denied");
}

export async function getOwnerOverview(ownerId: number): Promise<OverviewStats> {
  const ownerCampuses = await db
    .select({ id: campuses.id })
    .from(campuses)
    .where(eq(campuses.ownerId, ownerId));

  const campusIds = ownerCampuses.map((c) => c.id);

  const [pendingCount] = (campusIds.length > 0)
    ? await db
        .select({ value: count() })
        .from(billingRecords)
        .where(
          and(
            sql`${billingRecords.campusId} = ANY(ARRAY[${sql.join(campusIds, sql`, `)}]::int[])`,
            eq(billingRecords.status, "PENDING")
          )
        )
    : [{ value: 0 as unknown as string }];

  return {
    totalCampuses: campusIds.length,
    totalStudents: 0,
    totalStaff: 0,
    totalFamilies: 0,
    totalIncomePaise: 0,
    totalExpensesPaise: 0,
    totalPendingDuesPaise: 0,
    pendingBillingMonths: Number(pendingCount?.value ?? 0),
  };
}

export async function getBillingByOwner(
  ownerId: number,
  filter: BillingFilter = {}
): Promise<BillingRecord[]> {
  const ownerCampuses = await db
    .select({ id: campuses.id })
    .from(campuses)
    .where(eq(campuses.ownerId, ownerId));

  const campusIds = ownerCampuses.map((c) => c.id);
  if (campusIds.length === 0) return [];

  const conditions: ReturnType<typeof sql>[] = [
    sql`${billingRecords.campusId} = ANY(ARRAY[${sql.join(campusIds, sql`, `)}]::int[])`,
  ];
  if (filter.status) {
    conditions.push(eq(billingRecords.status, filter.status));
  }

  return db
    .select()
    .from(billingRecords)
    .where(and(...conditions))
    .orderBy(
      sql`${billingRecords.billingYear} DESC, ${billingRecords.billingMonth} DESC`
    );
}
