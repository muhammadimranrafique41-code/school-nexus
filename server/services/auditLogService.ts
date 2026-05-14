import { db } from "../db.js";
import { and, count, desc, sql } from "drizzle-orm";
import { auditLogs, type SelectAuditLog } from "../../shared/schema.js";

export interface AuditLogInput {
  actorId: number | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: number | null;
  targetOwnerId?: number | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export const auditLogService = {
  async log(input: AuditLogInput): Promise<void> {
    await db.insert(auditLogs).values({
      actorId: input.actorId ?? null,
      actorRole: input.actorRole,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      targetOwnerId: input.targetOwnerId ?? null,
      metadata: (input.metadata ?? {}) as any,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: new Date(),
    });
  },

  async getLogs(filter: {
    action?: string;
    entityType?: string;
    actorId?: number;
    targetOwnerId?: number;
    fromDate?: string;
    toDate?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ data: SelectAuditLog[]; total: number }> {
    const conditions: ReturnType<typeof sql>[] = [];
    if (filter.action) conditions.push(sql`${auditLogs.action} = ${filter.action}`);
    if (filter.entityType) conditions.push(sql`${auditLogs.entityType} = ${filter.entityType}`);
    if (filter.actorId) conditions.push(sql`${auditLogs.actorId} = ${filter.actorId}`);
    if (filter.targetOwnerId) conditions.push(sql`${auditLogs.targetOwnerId} = ${filter.targetOwnerId}`);
    if (filter.fromDate) conditions.push(sql`${auditLogs.createdAt} >= ${filter.fromDate}`);
    if (filter.toDate) conditions.push(sql`${auditLogs.createdAt} <= ${filter.toDate}`);

    const offset = ((filter.page ?? 1) - 1) * (filter.pageSize ?? 50);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : sql`1=1`)
      .orderBy(desc(auditLogs.createdAt))
      .limit(filter.pageSize ?? 50)
      .offset(offset);

    const [total] = await db.select({ value: count() }).from(auditLogs);

    return { data: logs, total: Number(total?.value ?? 0) };
  },
};
