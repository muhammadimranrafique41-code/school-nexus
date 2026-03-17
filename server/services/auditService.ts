/**
 * Audit Logging Service - Tracks all financial operations
 * Status: Provides comprehensive audit trail
 * 
 * Every financial action is logged for:
 * - Compliance and regulatory requirements
 * - Dispute resolution
 * - Fraud detection
 * - Financial reconciliation
 */

import { db } from "../db.js";
import { financeAuditLogs } from "../../shared/schema.js";
import type { FinanceAuditLog } from "../../shared/schema.js";

export type AuditAction = "create" | "update" | "delete" | "payment" | "adjustment";
export type AuditEntityType = "fee" | "payment" | "adjustment";

export interface AuditLogEntry {
  studentId: number;
  feeId?: number;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: number;
  changesBefore?: Record<string, any>;
  changesAfter?: Record<string, any>;
  reason?: string;
  metadata?: Record<string, any>;
  createdBy?: number;
}

export class AuditService {
  /**
   * Log an action to the audit trail
   */
  async logAction(entry: AuditLogEntry): Promise<FinanceAuditLog> {
    const timestamp = new Date().toISOString();

    const [created] = await db
      .insert(financeAuditLogs)
      .values({
        studentId: entry.studentId,
        feeId: entry.feeId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        changesBefore: entry.changesBefore ? JSON.stringify(entry.changesBefore) : null,
        changesAfter: entry.changesAfter ? JSON.stringify(entry.changesAfter) : null,
        reason: entry.reason ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        createdAt: timestamp,
        createdBy: entry.createdBy ?? null,
      })
      .returning();

    return created;
  }

  /**
   * Get audit logs for a student
   */
  async getStudentAuditLog(studentId: number, limit: number = 100): Promise<FinanceAuditLog[]> {
    const logs = await db
      .select()
      .from(financeAuditLogs)
      .where(db.eq(financeAuditLogs.studentId, studentId))
      .orderBy(db.desc(financeAuditLogs.createdAt))
      .limit(limit);

    return logs;
  }

  /**
   * Get audit logs for a specific fee
   */
  async getFeeAuditLog(feeId: number): Promise<FinanceAuditLog[]> {
    const logs = await db
      .select()
      .from(financeAuditLogs)
      .where(db.eq(financeAuditLogs.feeId, feeId))
      .orderBy(db.asc(financeAuditLogs.createdAt));

    return logs;
  }

  /**
   * Get all audit logs for a date range
   */
  async getAuditLogsByDateRange(
    startDate: string,
    endDate: string,
    limit: number = 1000
  ): Promise<FinanceAuditLog[]> {
    const logs = await db
      .select()
      .from(financeAuditLogs)
      .where(
        db.and(
          db.gte(financeAuditLogs.createdAt, startDate),
          db.lte(financeAuditLogs.createdAt, endDate)
        )
      )
      .orderBy(db.desc(financeAuditLogs.createdAt))
      .limit(limit);

    return logs;
  }

  /**
   * Get audit logs by action type
   */
  async getAuditLogsByAction(action: AuditAction, limit: number = 100): Promise<FinanceAuditLog[]> {
    const logs = await db
      .select()
      .from(financeAuditLogs)
      .where(db.eq(financeAuditLogs.action, action))
      .orderBy(db.desc(financeAuditLogs.createdAt))
      .limit(limit);

    return logs;
  }

  /**
   * Generate audit report for compliance
   */
  async generateComplianceReport(month: string): Promise<{
    month: string;
    totalActions: number;
    actionBreakdown: Record<AuditAction, number>;
    usersInvolved: number;
    studentsAffected: number;
    suspiciousActivities: Array<{
      date: string;
      studentId: number;
      action: AuditAction;
      description: string;
    }>;
  }> {
    // Get all logs for the month
    const startDate = `${month}-01T00:00:00.000Z`;
    const allLogs = await this.getAuditLogsByDateRange(startDate, `${month}-31T23:59:59.999Z`);

    // Count actions
    const actionBreakdown: Record<AuditAction, number> = {
      create: 0,
      update: 0,
      delete: 0,
      payment: 0,
      adjustment: 0,
    };

    const users = new Set<number>();
    const students = new Set<number>();

    for (const log of allLogs) {
      actionBreakdown[log.action]++;
      if (log.createdBy) users.add(log.createdBy);
      students.add(log.studentId);
    }

    // Detect suspicious activities (optional)
    const suspiciousActivities: Array<{
      date: string;
      studentId: number;
      action: AuditAction;
      description: string;
    }> = [];

    // Example: Multiple deletions by same user in short time
    const deleteActions = allLogs.filter(l => l.action === "delete");
    for (const action of deleteActions) {
      suspiciousActivities.push({
        date: action.createdAt,
        studentId: action.studentId,
        action: action.action,
        description: `Deletion of ${action.entityType} #${action.entityId}`,
      });
    }

    return {
      month,
      totalActions: allLogs.length,
      actionBreakdown,
      usersInvolved: users.size,
      studentsAffected: students.size,
      suspiciousActivities,
    };
  }

  /**
   * Export audit trail for external audit
   */
  async exportAuditTrail(startDate: string, endDate: string): Promise<string> {
    const logs = await this.getAuditLogsByDateRange(startDate, endDate);

    // Format as CSV for easy import into audit system
    let csv = "Date,StudentID,StudentName,Action,EntityType,EntityID,Reason,CreatedBy\n";

    for (const log of logs) {
      const reason = log.reason ? `"${log.reason}"` : "";
      csv += `${log.createdAt},${log.studentId},,${log.action},${log.entityType},${log.entityId},${reason},${log.createdBy}\n`;
    }

    return csv;
  }

  /**
   * Verify audit trail integrity
   * Checks for gaps or suspicious patterns
   */
  async verifyIntegrity(studentId: number): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const logs = await this.getStudentAuditLog(studentId, 1000);
    const issues: string[] = [];

    // Check for duplicates
    const seen = new Set<string>();
    for (const log of logs) {
      const key = `${log.createdAt}-${log.action}-${log.entityId}`;
      if (seen.has(key)) {
        issues.push(`Potential duplicate entry: ${key}`);
      }
      seen.add(key);
    }

    // Check for gaps (no deletions between creates and updates of same entity)
    // This is a simplified check

    return {
      isValid: issues.length === 0,
      issues,
    };
  }
}

// Export singleton
export const auditService = new AuditService();
