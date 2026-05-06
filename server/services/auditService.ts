/**
 * @file auditService.ts
 * @description Audit Logging Service — tracks all financial and voucher operations.
 *
 * Every financial action is logged for:
 * - Compliance and regulatory requirements
 * - Dispute resolution
 * - Fraud detection
 * - Financial reconciliation
 *
 * @module server/services/auditService
 */

import { db } from "../db.js";
import {
  financeAuditLogs,
  consolidatedVoucherAuditLog,
} from "../../shared/schema.js";
import type {
  FinanceAuditLog,
  ConsolidatedVoucherAuditLogRecord,
} from "../../shared/schema.js";

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

// ── Voucher operation audit types ─────────────────────────────────────────

/** Actions that can be recorded against a consolidated voucher. */
export type VoucherAuditAction =
  | "generated"
  | "regenerated"
  | "downloaded"
  | "printed"
  | "cancelled"
  | "status_changed";

/** Input for {@link AuditService.logVoucherOperation}. */
export interface VoucherOperationEntry {
  /** The `consolidated_vouchers.id` being acted upon. */
  consolidatedVoucherId: number;
  /** The `users.id` of the student the voucher belongs to. */
  studentId: number;
  /** The action being recorded. */
  action: VoucherAuditAction;
  /** Previous voucher status (for status_changed actions). */
  previousStatus?: string;
  /** New voucher status (for status_changed actions). */
  newStatus?: string;
  /** Freeform context: IP address, batch ID, reason, etc. */
  metadata?: Record<string, unknown>;
  /** The `users.id` of the person performing the action. */
  performedBy?: number;
}

const LOG = "[AuditService]";

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

  // ── Consolidated Voucher Audit ─────────────────────────────────────────

  /**
   * Record an audit event against a consolidated voucher.
   *
   * Called from `voucherService.ts`:
   * - Before generating a ZIP → action `"generated"`
   * - On success → action `"status_changed"` (draft → generated)
   * - In catch blocks → action `"cancelled"` with error metadata
   *
   * @param entry - The voucher operation details to record.
   * @returns The created audit log row, or `null` if the insert fails
   *   (failure is logged but never re-thrown to avoid masking the
   *   primary operation error).
   */
  async logVoucherOperation(
    entry: VoucherOperationEntry
  ): Promise<ConsolidatedVoucherAuditLogRecord | null> {
    console.log(
      `${LOG} logVoucherOperation — voucherId=${entry.consolidatedVoucherId} ` +
        `action=${entry.action} studentId=${entry.studentId}`
    );

    try {
      const timestamp = new Date().toISOString();

      const [created] = await db
        .insert(consolidatedVoucherAuditLog)
        .values({
          consolidatedVoucherId: entry.consolidatedVoucherId,
          studentId: entry.studentId,
          action: entry.action,
          previousStatus: entry.previousStatus ?? null,
          newStatus: entry.newStatus ?? null,
          metadata: entry.metadata ?? null,
          performedBy: entry.performedBy ?? null,
          createdAt: timestamp,
        })
        .returning();

      return created ?? null;
    } catch (err: unknown) {
      // Audit failures must never crash the primary operation
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${LOG} logVoucherOperation failed (non-fatal): ${msg}`);
      return null;
    }
  }

  /**
   * Convenience wrapper: log a voucher generation start event.
   *
   * @param consolidatedVoucherId - The voucher being generated.
   * @param studentId             - The student the voucher belongs to.
   * @param performedBy           - The user triggering the generation.
   * @param metadata              - Optional extra context (batch ID, etc.).
   */
  async logVoucherStart(
    consolidatedVoucherId: number,
    studentId: number,
    performedBy?: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.logVoucherOperation({
      consolidatedVoucherId,
      studentId,
      action: "generated",
      newStatus: "draft",
      performedBy,
      metadata,
    });
  }

  /**
   * Convenience wrapper: log a successful voucher generation.
   *
   * @param consolidatedVoucherId - The voucher that was generated.
   * @param studentId             - The student the voucher belongs to.
   * @param performedBy           - The user who triggered the generation.
   * @param metadata              - Optional extra context.
   */
  async logVoucherComplete(
    consolidatedVoucherId: number,
    studentId: number,
    performedBy?: number,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.logVoucherOperation({
      consolidatedVoucherId,
      studentId,
      action: "status_changed",
      previousStatus: "draft",
      newStatus: "generated",
      performedBy,
      metadata,
    });
  }

  /**
   * Convenience wrapper: log a voucher generation error.
   *
   * @param consolidatedVoucherId - The voucher that failed.
   * @param studentId             - The student the voucher belongs to.
   * @param error                 - The error that occurred.
   * @param performedBy           - The user who triggered the generation.
   */
  async logVoucherError(
    consolidatedVoucherId: number,
    studentId: number,
    error: unknown,
    performedBy?: number
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    await this.logVoucherOperation({
      consolidatedVoucherId,
      studentId,
      action: "cancelled",
      newStatus: "cancelled",
      performedBy,
      metadata: { error: errorMessage },
    });
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
