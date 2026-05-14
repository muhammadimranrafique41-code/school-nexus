import { db } from "../db.js";
import {
  campuses,
  students,
  staff,
  families,
  billingRecords,
  expenses,
  type Campus,
  type NewCampus,
  type BillingRecord,
} from "../../shared/schema.js";
import { eq, and, sql, count, sum } from "drizzle-orm";

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

  const campusIds = rows.map(r => r.id);
  const idsArr = campusIds.length > 0 ? sql`ARRAY[${sql.join(campusIds, sql`, `)}]::int[]` : null;

  const [studCounts, staffCounts, famCounts, incomeSums, pendingSums] = await Promise.all([
    idsArr
      ? db
          .select({ campusId: students.campusId, value: count() })
          .from(students)
          .where(sql`${students.campusId} = ANY(${idsArr})`)
          .groupBy(students.campusId)
      : Promise.resolve([]),
    idsArr
      ? db
          .select({ campusId: staff.campusId, value: count() })
          .from(staff)
          .where(sql`${staff.campusId} = ANY(${idsArr})`)
          .groupBy(staff.campusId)
      : Promise.resolve([]),
    idsArr
      ? db
          .select({ campusId: families.campusId, value: count() })
          .from(families)
          .where(sql`${families.campusId} = ANY(${idsArr})`)
          .groupBy(families.campusId)
      : Promise.resolve([]),
    idsArr
      ? db
          .select({ campusId: billingRecords.campusId, value: sum(billingRecords.amountPaise) })
          .from(billingRecords)
          .where(and(
            sql`${billingRecords.campusId} = ANY(${idsArr})`,
            eq(billingRecords.status, "PAID")
          ))
          .groupBy(billingRecords.campusId)
      : Promise.resolve([]),
    idsArr
      ? db
          .select({ campusId: billingRecords.campusId, value: sum(billingRecords.amountPaise) })
          .from(billingRecords)
          .where(and(
            sql`${billingRecords.campusId} = ANY(${idsArr})`,
            sql`${billingRecords.status} IN ('PENDING', 'OVERDUE')`
          ))
          .groupBy(billingRecords.campusId)
      : Promise.resolve([]),
  ]);

  const studMap = new Map(studCounts.map(r => [r.campusId, Number(r.value)]));
  const staffMap = new Map(staffCounts.map(r => [r.campusId, Number(r.value)]));
  const famMap = new Map(famCounts.map(r => [r.campusId, Number(r.value)]));
  const incomeMap = new Map(incomeSums.map(r => [r.campusId, Number(r.value)]));
  const pendingMap = new Map(pendingSums.map(r => [r.campusId, Number(r.value)]));

  const enriched = rows.map((campus) => ({
    ...campus,
    studentCount: studMap.get(campus.id) ?? 0,
    staffCount: staffMap.get(campus.id) ?? 0,
    familyCount: famMap.get(campus.id) ?? 0,
    incomePaise: incomeMap.get(campus.id) ?? 0,
    expensesPaise: 0,
    pendingDuesPaise: pendingMap.get(campus.id) ?? 0,
  } satisfies CampusRow));

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

  let pendingBillingMonths = 0;
  let totalStudents = 0;
  let totalStaff = 0;
  let totalFamilies = 0;

  let totalIncomePaise = 0;
  let totalPendingDuesPaise = 0;

  if (campusIds.length > 0) {
    const idsArr = sql`ARRAY[${sql.join(campusIds, sql`, `)}]::int[]`;

    const [[pendingCount], [studCount], [staffCount], [famCount],
           [incomeSum], [pendingSum]] = await Promise.all([
      db
        .select({ value: count() })
        .from(billingRecords)
        .where(
          and(
            sql`${billingRecords.campusId} = ANY(${idsArr})`,
            eq(billingRecords.status, "PENDING")
          )
        ),
      db
        .select({ value: count() })
        .from(students)
        .where(sql`${students.campusId} = ANY(${idsArr})`),
      db
        .select({ value: count() })
        .from(staff)
        .where(sql`${staff.campusId} = ANY(${idsArr})`),
      db
        .select({ value: count() })
        .from(families)
        .where(sql`${families.campusId} = ANY(${idsArr})`),
      db
        .select({ value: sum(billingRecords.amountPaise) })
        .from(billingRecords)
        .where(
          and(
            sql`${billingRecords.campusId} = ANY(${idsArr})`,
            eq(billingRecords.status, "PAID")
          )
        ),
      db
        .select({ value: sum(billingRecords.amountPaise) })
        .from(billingRecords)
        .where(
          and(
            sql`${billingRecords.campusId} = ANY(${idsArr})`,
            sql`${billingRecords.status} IN ('PENDING', 'OVERDUE')`
          )
        ),
    ]);

    pendingBillingMonths = Number(pendingCount?.value ?? 0);
    totalStudents = Number(studCount?.value ?? 0);
    totalStaff = Number(staffCount?.value ?? 0);
    totalFamilies = Number(famCount?.value ?? 0);
    totalIncomePaise = Number(incomeSum?.value ?? 0);
    totalPendingDuesPaise = Number(pendingSum?.value ?? 0);
  }

  return {
    totalCampuses: campusIds.length,
    totalStudents,
    totalStaff,
    totalFamilies,
    totalIncomePaise,
    totalExpensesPaise: 0,
    totalPendingDuesPaise,
    pendingBillingMonths,
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
