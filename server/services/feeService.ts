/**
 * Fee Service - Handles fee-related business operations
 * Status: Foundation layer, delegates to storage
 * 
 * This service provides a clear interface for fee operations.
 * Over time, business logic can be migrated here from storage.ts
 */

import { storage } from "../storage.ts";
import type { CreateFeeInput, FeeStatus, UpdateFeeInput } from "../../shared/finance.js";
import type { FeeWithStudent } from "../../shared/schema.js";

export class FeeService {
  /**
   * Get all fees
   */
  async getAllFees(): Promise<FeeWithStudent[]> {
    return storage.getFees();
  }

  /**
   * Get fees for a specific student
   */
  async getFeesByStudent(studentId: number): Promise<FeeWithStudent[]> {
    return storage.getFeesByStudent(studentId);
  }

  /**
   * Get a specific fee by ID
   */
  async getFeeById(feeId: number): Promise<FeeWithStudent | undefined> {
    return storage.getFee(feeId);
  }

  /**
   * Create a new fee/invoice
   * 
   * Business rules:
   * - Student must exist and have "student" role
   * - Amount must be positive
   * - Due date must be in valid format
   * - Generates invoice number automatically
   * - Creates ledger entry for audit trail
   */
  async createFee(input: CreateFeeInput): Promise<FeeWithStudent> {
    // Validation happens in the storage layer
    // This is a good place to add additional business logic in the future
    return storage.createFee(input);
  }

  /**
   * Update an existing fee
   * 
   * Business rules:
   * - Cannot set amount less than already paid amount
   * - Validates student exists
   * - Updates ledger if amount changes
   */
  async updateFee(feeId: number, updates: UpdateFeeInput): Promise<FeeWithStudent | undefined> {
    return storage.updateFee(feeId, updates);
  }

  /**
   * Delete a fee
   * 
   * Note: In future, consider soft deletes instead
   */
  async deleteFee(feeId: number): Promise<boolean> {
    return storage.deleteFee(feeId);
  }

  /**
   * Check if a fee is overdue
   */
  async isOverdue(feeId: number): Promise<boolean> {
    const fee = await this.getFeeById(feeId);
    if (!fee) return false;
    
    const dueDate = new Date(fee.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return fee.remainingBalance > 0 && dueDate < today;
  }

  /**
   * Calculate total outstanding amount for a student
   */
  async calculateStudentOutstanding(studentId: number): Promise<number> {
    const fees = await this.getFeesByStudent(studentId);
    return fees.reduce((sum, fee) => sum + fee.remainingBalance, 0);
  }

  /**
   * Calculate total overdue amount for a student
   */
  async calculateStudentOverdue(studentId: number): Promise<number> {
    const fees = await this.getFeesByStudent(studentId);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return fees.reduce((sum, fee) => {
      const dueDate = new Date(fee.dueDate);
      return dueDate < today && fee.remainingBalance > 0 ? sum + fee.remainingBalance : sum;
    }, 0);
  }
}

export const feeService = new FeeService();
