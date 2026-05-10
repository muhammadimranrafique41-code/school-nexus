/**
 * @file activityLogService.ts
 * @description Activity Log Service — provides an immutable audit trail for accountability,
 * security, and forensic analysis across the entire application.
 */

import { and, asc, desc, eq, gte, lte, ilike, sql, count } from "drizzle-orm";
import { db } from "../db.js";
import { activityLogs, type ActivityLog, type InsertActivityLog } from "../../shared/schema.js";

export interface ActivityLogFilter {
  userId?: number;
  userEmail?: string;
  action?: string;
  entityType?: string;
  entityId?: number;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedActivityLogs {
  logs: ActivityLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function logActivity(data: Omit<InsertActivityLog, "id" | "createdAt">): Promise<ActivityLog | null> {
  try {
    const [created] = await db
      .insert(activityLogs)
      .values({
        userId: data.userId ?? null,
        userEmail: data.userEmail,
        userRole: data.userRole,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        oldValues: data.oldValues ?? null,
        newValues: data.newValues ?? null,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        requestMethod: data.requestMethod ?? null,
        requestPath: data.requestPath ?? null,
        statusCode: data.statusCode ?? null,
        durationMs: data.durationMs ?? null,
      })
      .returning();
    return created;
  } catch (error) {
    console.error("Failed to log activity:", error);
    return null;
  }
}

export async function getActivityLogs(filters: ActivityLogFilter): Promise<PaginatedActivityLogs> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [];

  if (filters.userId) {
    conditions.push(eq(activityLogs.userId, filters.userId));
  }
  if (filters.userEmail) {
    conditions.push(ilike(activityLogs.userEmail, `%${filters.userEmail}%`));
  }
  if (filters.action) {
    conditions.push(eq(activityLogs.action, filters.action));
  }
  if (filters.entityType) {
    conditions.push(eq(activityLogs.entityType, filters.entityType));
  }
  if (filters.entityId) {
    conditions.push(eq(activityLogs.entityId, filters.entityId));
  }
  if (filters.startDate) {
    conditions.push(gte(activityLogs.createdAt, new Date(filters.startDate)));
  }
  if (filters.endDate) {
    conditions.push(lte(activityLogs.createdAt, new Date(filters.endDate)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [logs, totalResult] = await Promise.all([
    db
      .select()
      .from(activityLogs)
      .where(whereClause)
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(activityLogs)
      .where(whereClause),
  ]);

  const total = totalResult[0]?.count ?? 0;
  const totalPages = Math.ceil(total / limit);

  return {
    logs,
    total,
    page,
    limit,
    totalPages,
  };
}

export async function getActivityLogById(id: number): Promise<ActivityLog | null> {
  const [log] = await db
    .select()
    .from(activityLogs)
    .where(eq(activityLogs.id, id))
    .limit(1);
  return log ?? null;
}

export async function pruneOldActivityLogs(retentionDays: number = 365): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const result = await db
    .delete(activityLogs)
    .where(lte(activityLogs.createdAt, cutoffDate))
    .returning({ id: activityLogs.id });

  return result.length;
}