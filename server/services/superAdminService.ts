import { db } from "../db.js";
import { sql, eq, and, count, sum, desc } from "drizzle-orm";
import {
  users,
  students,
  campuses,
  billingRecords,
  jazzcashPaymentIntents,
  owners,
  auditLogs,
  platformSettings,
  type SelectOwner,
} from "../../shared/schema.js";
import { AppError } from "../errors.js";
import { auditLogService } from "./auditLogService.js";

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
  status: "PAID" | "PENDING" | "OVERDUE" | "CANCELLED";
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

export async function getPlatformStats(): Promise<PlatformStats> {
  const [[ownerCount], [campusCount], [studentCount], [activeCount], [suspendedCount],
         [trialCount], [overdueCount], [pendingCount]] = await Promise.all([
    db.select({ value: count() }).from(users).where(eq(users.role, "owner")),
    db.select({ value: count() }).from(campuses),
    db.select({ value: count() }).from(users).where(eq(users.role, "student")),
    db.select({ value: count() }).from(owners).where(eq(owners.status, "ACTIVE")),
    db.select({ value: count() }).from(owners).where(eq(owners.status, "SUSPENDED")),
    db.select({ value: count() }).from(owners).where(eq(owners.status, "ON_TRIAL")),
    db.select({ value: count() }).from(billingRecords).where(eq(billingRecords.status, "OVERDUE")),
    db.select({ value: count() }).from(billingRecords).where(eq(billingRecords.status, "PENDING")),
  ]);

  const [revenueResult] = await db
    .select({ value: sum(jazzcashPaymentIntents.appliedAmountPkr) })
    .from(jazzcashPaymentIntents)
    .where(eq(jazzcashPaymentIntents.status, "COMPLETED"));

  const [pendingDuesResult] = await db
    .select({ value: sum(billingRecords.amountPaise) })
    .from(billingRecords)
    .where(sql`${billingRecords.status} IN ('PENDING', 'OVERDUE')`);

  const [[campusCount30d]] = await Promise.all([
    db.select({ value: count() }).from(campuses)
      .where(sql`${campuses.createdAt} >= NOW() - INTERVAL '30 days'`),
  ]);

  const totalCampusCount = Number(campusCount?.value ?? 0);
  const recentCampusCount = Number(campusCount30d?.value ?? 0);
  const platformGrowthPercent30d = totalCampusCount > 0
    ? Math.round((recentCampusCount / totalCampusCount) * 100)
    : 0;

  return {
    totalOwners: Number(ownerCount?.value ?? 0),
    totalCampuses: totalCampusCount,
    totalStudents: Number(studentCount?.value ?? 0),
    totalRevenuePaise: Number(revenueResult?.value ?? 0),
    totalPendingDuesPaise: Number(pendingDuesResult?.value ?? 0),
    activeSchools: Number(activeCount?.value ?? 0),
    inactiveSchools: Number(activeCount?.value ?? 0) - Number(suspendedCount?.value ?? 0),
    suspendedSchools: Number(suspendedCount?.value ?? 0),
    trialSchools: Number(trialCount?.value ?? 0),
    platformGrowthPercent30d,
    pendingInvoicesCount: Number(pendingCount?.value ?? 0),
    overdueInvoicesCount: Number(overdueCount?.value ?? 0),
  };
}

export async function getOwners(): Promise<OwnerRow[]> {
  const allOwners = await db.select().from(owners).orderBy(desc(owners.createdAt));

  const enriched = await Promise.all(allOwners.map(async (owner) => {
    const [[campusCountResult], [pendingDues], [studentCountResult], [lastBillingResult]] = await Promise.all([
      db.select({ value: count() }).from(campuses).where(eq(campuses.ownerId, owner.id)),
      db.select({ value: sum(billingRecords.amountPaise) })
        .from(billingRecords)
        .where(and(
          sql`${billingRecords.campusId} IN (SELECT id FROM campuses WHERE owner_id = ${owner.id})`,
          sql`${billingRecords.status} IN ('PENDING', 'OVERDUE')`
        )),
      db.select({ value: count() })
        .from(students)
        .where(sql`${students.campusId} IN (SELECT id FROM campuses WHERE owner_id = ${owner.id})`),
      db.select({ paidAt: billingRecords.paidAt })
        .from(billingRecords)
        .where(and(
          sql`${billingRecords.campusId} IN (SELECT id FROM campuses WHERE owner_id = ${owner.id})`,
          sql`${billingRecords.paidAt} IS NOT NULL`
        ))
        .orderBy(desc(billingRecords.paidAt))
        .limit(1),
    ]);

    return {
      ...owner,
      campusCount: Number(campusCountResult?.value ?? 0),
      studentCount: Number(studentCountResult?.value ?? 0),
      pendingDuesPaise: Number(pendingDues?.value ?? 0),
      lastBillingDate: lastBillingResult?.paidAt ? lastBillingResult.paidAt.toISOString() : null,
    } satisfies OwnerRow;
  }));

  return enriched;
}

export async function getOwnerById(ownerId: number): Promise<OwnerRow | null> {
  const [owner] = await db.select().from(owners).where(eq(owners.id, ownerId)).limit(1);
  if (!owner) return null;

  const [[campusCountResult], [pendingDues], [studentCountResult], [lastBillingResult]] = await Promise.all([
    db.select({ value: count() }).from(campuses).where(eq(campuses.ownerId, ownerId)),
    db.select({ value: sum(billingRecords.amountPaise) })
      .from(billingRecords)
      .where(and(
        sql`${billingRecords.campusId} IN (SELECT id FROM campuses WHERE owner_id = ${ownerId})`,
        sql`${billingRecords.status} IN ('PENDING', 'OVERDUE')`
      )),
    db.select({ value: count() })
      .from(students)
      .where(sql`${students.campusId} IN (SELECT id FROM campuses WHERE owner_id = ${ownerId})`),
    db.select({ paidAt: billingRecords.paidAt })
      .from(billingRecords)
      .where(and(
        sql`${billingRecords.campusId} IN (SELECT id FROM campuses WHERE owner_id = ${ownerId})`,
        sql`${billingRecords.paidAt} IS NOT NULL`
      ))
      .orderBy(desc(billingRecords.paidAt))
      .limit(1),
  ]);

  return {
    ...owner,
    campusCount: Number(campusCountResult?.value ?? 0),
    studentCount: Number(studentCountResult?.value ?? 0),
    pendingDuesPaise: Number(pendingDues?.value ?? 0),
    lastBillingDate: lastBillingResult?.paidAt ? lastBillingResult.paidAt.toISOString() : null,
  } satisfies OwnerRow;
}

export async function createOwner(data: {
  name: string;
  email: string;
  phone?: string;
  plan: "STARTER" | "PROFESSIONAL" | "ENTERPRISE";
}): Promise<SelectOwner> {
  const [owner] = await db.insert(owners).values({
    name: data.name,
    email: data.email,
    phone: data.phone ?? null,
    plan: data.plan,
    status: "ON_TRIAL",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
  return owner;
}

export async function updateOwnerStatus(
  ownerId: number,
  newStatus: "ACTIVE" | "SUSPENDED" | "ON_TRIAL",
  reason?: string,
  actorId?: number
): Promise<SelectOwner> {
  const [updated] = await db
    .update(owners)
    .set({
      status: newStatus,
      suspendedAt: newStatus === "SUSPENDED" ? new Date() : null,
      suspendedReason: newStatus === "SUSPENDED" ? reason : null,
      updatedAt: new Date(),
    })
    .where(eq(owners.id, ownerId))
    .returning();

  if (!updated) throw new AppError("Owner not found", "OWNER_NOT_FOUND", 404);

  await auditLogService.log({
    actorId: actorId ?? null,
    actorRole: "super_admin",
    action: newStatus === "ACTIVE" ? "OWNER_REACTIVATED" : "OWNER_SUSPENDED",
    entityType: "owner",
    entityId: ownerId,
    targetOwnerId: ownerId,
    metadata: { previousStatus: null, newStatus, reason },
  });

  return updated;
}

export async function getAllBillingRecords(filter: {
  status?: "PAID" | "PENDING" | "OVERDUE" | "CANCELLED";
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
      id: billingRecords.id,
      ownerId: campuses.ownerId,
      campusId: billingRecords.campusId,
      amountPaise: billingRecords.amountPaise,
      status: billingRecords.status,
      billingMonth: billingRecords.billingMonth,
      billingYear: billingRecords.billingYear,
      dueDate: billingRecords.dueDate,
      paidAt: billingRecords.paidAt,
      createdAt: billingRecords.createdAt,
    })
    .from(billingRecords)
    .innerJoin(campuses, eq(billingRecords.campusId, campuses.id))
    .where(conditions.length > 0 ? and(...conditions) : sql`1=1`)
    .orderBy(desc(billingRecords.createdAt))
    .limit(filter.pageSize ?? 25)
    .offset(offset);

  const [totalCount] = await db
    .select({ value: count() })
    .from(billingRecords);

  const enriched: BillingRecordRow[] = await Promise.all(
    records.map(async (r) => {
      const [owner] = await db.select({ name: users.name }).from(users).where(eq(users.id, r.ownerId)).limit(1);
      const [campus] = await db.select({ name: campuses.name }).from(campuses).where(eq(campuses.id, r.campusId)).limit(1);
      return {
        id: r.id,
        ownerId: r.ownerId,
        ownerName: owner?.name ?? "Unknown",
        campusId: r.campusId,
        campusName: campus?.name ?? "Unknown",
        amountPaise: r.amountPaise,
        status: r.status,
        billingMonth: r.billingMonth,
        billingYear: r.billingYear,
        dueDate: String(r.dueDate),
        paidAt: r.paidAt ? String(r.paidAt) : null,
        createdAt: String(r.createdAt),
      } satisfies BillingRecordRow;
    })
  );

  return { data: enriched, total: Number(totalCount?.value ?? 0) };
}

export async function overrideBillingStatus(
  recordId: number,
  newStatus: "PAID" | "CANCELLED",
  actorId: number,
  notes?: string
): Promise<typeof billingRecords.$inferSelect> {
  const [updated] = await db
    .update(billingRecords)
    .set({
      status: newStatus,
      paidAt: newStatus === "PAID" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(billingRecords.id, recordId))
    .returning();

  if (!updated) throw new AppError("Billing record not found", "RECORD_NOT_FOUND", 404);

  await auditLogService.log({
    actorId,
    actorRole: "super_admin",
    action: "BILLING_OVERRIDE",
    entityType: "billing_record",
    entityId: recordId,
    metadata: { newStatus, notes, previousStatus: updated.status },
  });

  return updated;
}

export async function getSystemHealth(): Promise<SystemHealthStatus> {
  const start = Date.now();
  await db.execute(sql`SELECT 1`);
  const dbLatencyMs = Date.now() - start;

  const [storageResult, sessionResult] = await Promise.all([
    db.execute<{ pg_database_size: number }>(
      sql`SELECT pg_database_size(current_database())`
    ),
    db.execute<{ count: number }>(
      sql`SELECT COUNT(*)::int AS count FROM session WHERE expire > NOW()`
    ),
  ]);

  return {
    databaseConnected: true,
    databaseLatencyMs: dbLatencyMs,
    storageUsedBytes: Number(storageResult.rows[0]?.pg_database_size ?? 0),
    storageTotalBytes: 10 * 1024 * 1024 * 1024,
    apiLatencyP50Ms: dbLatencyMs,
    apiLatencyP95Ms: Math.round(dbLatencyMs * 1.5),
    activeSessions: Number(sessionResult.rows[0]?.count ?? 0),
    timestamp: new Date().toISOString(),
  };
}

export async function getPlatformSetting(key: string): Promise<unknown | null> {
  const [setting] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);
  return setting?.value ?? null;
}

export async function getOwnerCampuses(ownerId: number) {
  return db.select().from(campuses).where(eq(campuses.ownerId, ownerId));
}

export async function deleteOwner(ownerId: number): Promise<void> {
  const [deleted] = await db
    .update(owners)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(owners.id, ownerId))
    .returning();
  if (!deleted) throw new AppError("Owner not found", "OWNER_NOT_FOUND", 404);
}

export async function startImpersonation(
  originalUserId: number,
  targetUserId: number,
  targetRole: string
): Promise<string> {
  const payload = {
    targetUserId,
    targetRole,
    originalUserId,
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export async function endImpersonation(originalUserId: number): Promise<void> {
  return;
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
    actorRole: "super_admin",
    action: "PLATFORM_SETTING_CHANGE",
    entityType: "platform_setting",
    entityId: null,
    metadata: { key, value },
  });
}
