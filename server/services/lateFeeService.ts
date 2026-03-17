/**
 * Late Fee Service - Automates late fee application
 * Status: Safe for cron jobs and batch processing
 * 
 * Handles automated application of late fees based on overdue status and settings.
 * Designed to be idempotent - safe to run multiple times without creating duplicates.
 */

import { storage } from "../storage.js";
import type { CreateFeeAdjustmentInput } from "../../shared/finance.js";
import type { PublicSchoolSettings } from "../../shared/settings.js";

export interface LateFeeApplicationResult {
  processedCount: number;
  appliedCount: number;
  skippedCount: number;
  failedCount: number;
  totalLateFeeAmount: number;
  errors: Array<{ feeId: number; studentId: number; error: string }>;
}

export interface LateFeeConfig {
  lateFeePercentage: number;
  lateFeeGraceDays: number;  // Days after due date before late fee applies
  maxLateFeePercentage: number;  // Cap on late fee (e.g., 25% max)
  lateFeeRoundingMode: "round" | "ceil" | "floor";  // How to round late fee amount
}

export class LateFeeService {
  /**
   * Get late fee configuration from school settings
   */
  private async getLateFeeConfig(): Promise<LateFeeConfig> {
    const settings = await storage.getPublicSchoolSettings();
    const fs = settings.financialSettings;
    
    return {
      lateFeePercentage: fs.lateFeePercentage || 0,
      lateFeeGraceDays: fs.lateFeeGraceDays || 0,
      maxLateFeePercentage: fs.maxLateFeePercentage || 25,
      lateFeeRoundingMode: (fs.lateFeeRoundingMode || "round") as "round" | "ceil" | "floor",
    };
  }

  /**
   * Calculate the amount of late fee for an overdue invoice
   * 
   * Returns 0 if:
   * - amount is already paid
   * - late fee percentage is 0
   * - invoice is not overdue enough
   */
  private calculateLateFee(
    overdueBalance: number,
    daysOverdue: number,
    config: LateFeeConfig
  ): number {
    if (overdueBalance <= 0 || config.lateFeePercentage <= 0) {
      return 0;
    }

    if (daysOverdue < config.lateFeeGraceDays) {
      return 0;
    }

    // Calculate late fee as percentage
    let lateFee = (overdueBalance * config.lateFeePercentage) / 100;

    // Apply maximum cap
    const maxAllowed = (overdueBalance * config.maxLateFeePercentage) / 100;
    lateFee = Math.min(lateFee, maxAllowed);

    // Round based on configuration
    switch (config.lateFeeRoundingMode) {
      case "ceil":
        return Math.ceil(lateFee);
      case "floor":
        return Math.floor(lateFee);
      case "round":
      default:
        return Math.round(lateFee);
    }
  }

  /**
   * Check if a late fee already exists for an invoice
   * This prevents duplicate late fees on the same invoice
   */
  private hasExistingLateFee(adjustments: any[]): boolean {
    return adjustments?.some(adj => 
      adj.type === "fine" && adj.reason.includes("Late fee")
    ) ?? false;
  }

  /**
   * Apply late fees to all overdue invoices
   * 
   * This is designed to be run as a scheduled job (e.g., daily).
   * It is idempotent - running it multiple times won't create duplicate fees.
   * 
   * Business logic:
   * - Only applies to invoices past grace period
   * - Skips invoices that already have a late fee
   * - Respects percentage caps from settings
   * - Returns detailed report of actions taken
   */
  async applyLateFees(): Promise<LateFeeApplicationResult> {
    const config = await this.getLateFeeConfig();
    const result: LateFeeApplicationResult = {
      processedCount: 0,
      appliedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      totalLateFeeAmount: 0,
      errors: [],
    };

    // Early exit if late fees are disabled
    if (config.lateFeePercentage <= 0) {
      return result;
    }

    try {
      const fees = await storage.getFees();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const fee of fees) {
        result.processedCount++;

        try {
          // Skip if fully paid
          if (fee.remainingBalance <= 0) {
            result.skippedCount++;
            continue;
          }

          const dueDate = new Date(fee.dueDate);
          dueDate.setHours(0, 0, 0, 0);

          const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

          // Skip if not yet overdue
          if (daysOverdue < config.lateFeeGraceDays) {
            result.skippedCount++;
            continue;
          }

          // Skip if late fee already exists
          if (this.hasExistingLateFee(fee.adjustments)) {
            result.skippedCount++;
            continue;
          }

          // Calculate and apply late fee
          const lateFeeAmount = this.calculateLateFee(
            fee.remainingBalance,
            daysOverdue,
            config
          );

          if (lateFeeAmount <= 0) {
            result.skippedCount++;
            continue;
          }

          // Create late fee adjustment
          const adjustment: CreateFeeAdjustmentInput = {
            feeId: fee.id,
            type: "fine",
            amount: lateFeeAmount,
            reason: `Late fee: ${daysOverdue} days overdue (${config.lateFeePercentage}% of ₹${fee.remainingBalance})`,
            notes: `Applied on ${today.toISOString().split("T")[0]}`,
          };

          await storage.createFeeAdjustment(fee.id, adjustment, undefined);

          result.appliedCount++;
          result.totalLateFeeAmount += lateFeeAmount;
        } catch (error) {
          result.failedCount++;
          result.errors.push({
            feeId: fee.id,
            studentId: fee.studentId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      result.errors.push({
        feeId: 0,
        studentId: 0,
        error: `Job failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return result;
  }

  /**
   * Get late fee forecast (which invoices would get late fees)
   * Useful for preview before running actual automation
   */
  async getLateFeesForecast(): Promise<Array<{
    feeId: number;
    studentId: number;
    studentName: string;
    dueDate: string;
    daysOverdue: number;
    overdueAmount: number;
    projectedLateFee: number;
  }>> {
    const config = await this.getLateFeeConfig();
    const fees = await storage.getFees();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const forecast = [];

    for (const fee of fees) {
      if (fee.remainingBalance <= 0) continue;
      if (this.hasExistingLateFee(fee.adjustments)) continue;

      const dueDate = new Date(fee.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysOverdue >= config.lateFeeGraceDays) {
        const lateFee = this.calculateLateFee(fee.remainingBalance, daysOverdue, config);
        if (lateFee > 0) {
          forecast.push({
            feeId: fee.id,
            studentId: fee.studentId,
            studentName: fee.student?.name || "Unknown",
            dueDate: fee.dueDate,
            daysOverdue,
            overdueAmount: fee.remainingBalance,
            projectedLateFee: lateFee,
          });
        }
      }
    }

    return forecast.sort((a, b) => b.projectedLateFee - a.projectedLateFee);
  }

  /**
   * Reset late fees for testing/administrative purposes
   * WARNING: This should only be used in very specific situations
   */
  async resetLateFee(feeId: number): Promise<boolean> {
    const fee = await storage.getFee(feeId);
    if (!fee) return false;

    // Find and remove late fee adjustment (if exists)
    // Note: This requires a delete adjustment method in storage
    // For now, we'll just return false as this needs additional implementation
    
    return false;
  }
}

export const lateFeeService = new LateFeeService();
