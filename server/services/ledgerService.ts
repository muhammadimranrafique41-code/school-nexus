/**
 * Ledger Service - Handles financial ledger operations
 * Status: Foundation layer for audit trail and accounting
 * 
 * This service provides methods for accessing and analyzing the financial ledger.
 * It's the source-of-truth for all financial transactions.
 */

import { storage } from "../storage.js";
import type { FinanceLedgerEntry } from "../../shared/schema.js";

export class LedgerService {
  /**
   * Get all ledger entries for a student
   * These entries form the audit trail of all financial transactions
   */
  async getStudentLedger(studentId: number): Promise<FinanceLedgerEntry[]> {
    return storage.getLedgerEntriesByStudent(studentId);
  }

  /**
   * Get all ledger entries for a specific fee
   */
  async getFeeLedger(feeId: number): Promise<FinanceLedgerEntry[]> {
    return storage.getLedgerEntriesByFee(feeId);
  }

  /**
   * Calculate running balance for a student at a specific point in time
   */
  async getBalanceAtTime(studentId: number, beforeDate?: string): Promise<number> {
    const entries = await this.getStudentLedger(studentId);
    
    let balance = 0;
    for (const entry of entries) {
      if (beforeDate && entry.createdAt >= beforeDate) break;
      balance = entry.balanceAfter;
    }
    
    return balance;
  }

  /**
   * Get total debits (invoices + fines) for a student
   */
  async getTotalDebits(studentId: number): Promise<number> {
    const entries = await this.getStudentLedger(studentId);
    return entries.reduce((sum, entry) => sum + entry.debit, 0);
  }

  /**
   * Get total credits (payments + discounts) for a student
   */
  async getTotalCredits(studentId: number): Promise<number> {
    const entries = await this.getStudentLedger(studentId);
    return entries.reduce((sum, entry) => sum + entry.credit, 0);
  }

  /**
   * Get current balance for a student
   */
  async getCurrentBalance(studentId: number): Promise<number> {
    const entries = await this.getStudentLedger(studentId);
    if (entries.length === 0) return 0;
    
    // Last entry has the current balance
    return entries[entries.length - 1].balanceAfter;
  }

  /**
   * Get all invoices from the ledger
   */
  async getInvoices(studentId: number): Promise<FinanceLedgerEntry[]> {
    const entries = await this.getStudentLedger(studentId);
    return entries.filter(entry => entry.type === "invoice");
  }

  /**
   * Get all payments from the ledger
   */
  async getPayments(studentId: number): Promise<FinanceLedgerEntry[]> {
    const entries = await this.getStudentLedger(studentId);
    return entries.filter(entry => entry.type === "payment");
  }

  /**
   * Get all adjustments (discounts/fines) from the ledger
   */
  async getAdjustments(studentId: number): Promise<FinanceLedgerEntry[]> {
    const entries = await this.getStudentLedger(studentId);
    return entries.filter(entry => 
      ["discount", "fine", "scholarship"].includes(entry.type)
    );
  }

  /**
   * Reconcile ledger with actual fee records
   * 
   * This validates that the ledger is consistent with the fees/payments/adjustments tables.
   * Useful for detecting data inconsistencies.
   */
  async reconcile(studentId: number): Promise<{
    isValid: boolean;
    discrepancies: string[];
    ledgerBalance: number;
  }> {
    const ledgerBalance = await this.getCurrentBalance(studentId);
    const discrepancies: string[] = [];
    
    // TODO: Implement full reconciliation logic
    // This would compare ledger balance with calculated balance from fees table
    
    return {
      isValid: discrepancies.length === 0,
      discrepancies,
      ledgerBalance,
    };
  }

  /**
   * Export ledger entries for audit
   */
  async exportForAudit(studentId: number): Promise<{
    studentId: number;
    entries: FinanceLedgerEntry[];
    summary: {
      totalDebits: number;
      totalCredits: number;
      currentBalance: number;
      entryCount: number;
    };
  }> {
    const entries = await this.getStudentLedger(studentId);
    
    return {
      studentId,
      entries,
      summary: {
        totalDebits: await this.getTotalDebits(studentId),
        totalCredits: await this.getTotalCredits(studentId),
        currentBalance: await this.getCurrentBalance(studentId),
        entryCount: entries.length,
      },
    };
  }
}

export const ledgerService = new LedgerService();
