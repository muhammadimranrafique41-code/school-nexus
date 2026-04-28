/**
 * Reporting Service - Generates financial insights and reports
 * Status: Uses existing helper functions and new service layer
 * 
 * Provides comprehensive financial reporting capabilities for school finance operations.
 */

import { storage } from "../storage.ts";
import { feeService } from "./feeService.js";
import { paymentService } from "./paymentService.js";
import type { FeeWithStudent } from "../../shared/schema.js";

export interface MonthlyRevenueData {
  month: string;
  billed: number;
  paid: number;
  outstanding: number;
  collectionRate: number;
}

export interface ClassRevenueData {
  className: string;
  studentCount: number;
  totalBilled: number;
  totalPaid: number;
  totalOutstanding: number;
  collectionRate: number;
}

export interface DefaulterData {
  studentId: number;
  studentName: string;
  className?: string;
  totalOverdue: number;
  daysOverdue: number;
  invoiceCount: number;
  oldestDueDate: string;
}

export interface PaymentMethodData {
  method: string;
  count: number;
  totalAmount: number;
  averageAmount: number;
}

export class ReportingService {
  /**
   * Get monthly revenue trend
   * Shows billing and collection trends over time
   */
  async getMonthlyRevenueTrend(months?: number): Promise<MonthlyRevenueData[]> {
    const fees = await storage.getFees();
    
    // Group fees by billing month
    const monthlyData = new Map<string, { billed: number; paid: number }>();
    
    for (const fee of fees) {
      const month = fee.billingMonth;
      const current = monthlyData.get(month) || { billed: 0, paid: 0 };
      current.billed += fee.amount;
      current.paid += fee.paidAmount;
      monthlyData.set(month, current);
    }
    
    // Convert to array and calculate rates
    const result: MonthlyRevenueData[] = Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        billed: data.billed,
        paid: data.paid,
        outstanding: data.billed - data.paid,
        collectionRate: data.billed > 0 ? Math.round((data.paid / data.billed) * 100) : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
    
    // Return only the last N months if specified
    return months ? result.slice(-months) : result;
  }

  /**
   * Get defaulters list (students with overdue balances)
   * Ordered by days overdue (most critical first)
   */
  async getDefaultersList(): Promise<DefaulterData[]> {
    const fees = await storage.getFees();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Group by student and find overdue amounts
    const defaultersMap = new Map<number, {
      studentName: string;
      className?: string;
      totalOverdue: number;
      invoices: { dueDate: string; balance: number }[];
    }>();
    
    for (const fee of fees) {
      if (!fee.student) continue;
      
      const dueDate = new Date(fee.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      
      if (dueDate < today && fee.remainingBalance > 0) {
        const existing = defaultersMap.get(fee.studentId) || {
          studentName: fee.student.name || "",
          className: fee.student.className,
          totalOverdue: 0,
          invoices: [],
        };
        existing.totalOverdue += fee.remainingBalance;
        existing.invoices.push({ dueDate: fee.dueDate, balance: fee.remainingBalance });
        defaultersMap.set(fee.studentId, existing);
      }
    }
    
    // Convert to array and calculate days overdue
    const defaulters: DefaulterData[] = Array.from(defaultersMap.entries())
      .map(([studentId, data]) => {
        const oldestDue = data.invoices.reduce((oldest, inv) => 
          inv.dueDate < oldest ? inv.dueDate : oldest
        );
        const daysOverdue = Math.floor((today.getTime() - new Date(oldestDue).getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          studentId,
          studentName: data.studentName,
          className: data.className,
          totalOverdue: data.totalOverdue,
          daysOverdue,
          invoiceCount: data.invoices.length,
          oldestDueDate: oldestDue,
        };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue);
    
    return defaulters;
  }

  /**
   * Get class-wise revenue breakdown
   */
  async getClassWiseRevenue(): Promise<ClassRevenueData[]> {
    const fees = await storage.getFees();
    
    // Group by class
    const classMap = new Map<string, {
      students: Set<number>;
      billed: number;
      paid: number;
    }>();
    
    for (const fee of fees) {
      const className = fee.student?.className || "Unknown";
      const current = classMap.get(className) || {
        students: new Set(),
        billed: 0,
        paid: 0,
      };
      
      current.students.add(fee.studentId);
      current.billed += fee.amount;
      current.paid += fee.paidAmount;
      classMap.set(className, current);
    }
    
    // Convert to array with calculated rates
    const result: ClassRevenueData[] = Array.from(classMap.entries())
      .map(([className, data]) => ({
        className,
        studentCount: data.students.size,
        totalBilled: data.billed,
        totalPaid: data.paid,
        totalOutstanding: data.billed - data.paid,
        collectionRate: data.billed > 0 ? Math.round((data.paid / data.billed) * 100) : 0,
      }))
      .sort((a, b) => a.className.localeCompare(b.className));
    
    return result;
  }

  /**
   * Get payment method breakdown
   */
  async getPaymentMethodBreakdown(): Promise<PaymentMethodData[]> {
    const payments = await storage.getFeePayments();
    
    // Group by method
    const methodMap = new Map<string, { count: number; total: number }>();
    
    for (const payment of payments) {
      const method = payment.method;
      const current = methodMap.get(method) || { count: 0, total: 0 };
      current.count += 1;
      current.total += payment.amount;
      methodMap.set(method, current);
    }
    
    // Convert to array with calculated averages
    const result: PaymentMethodData[] = Array.from(methodMap.entries())
      .map(([method, data]) => ({
        method,
        count: data.count,
        totalAmount: data.total,
        averageAmount: Math.round(data.total / data.count),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
    
    return result;
  }

  /**
   * Get comprehensive financial summary
   */
  async getFinancialSummary() {
    const [
      monthlyTrend,
      defaulters,
      classwise,
      paymentMethods,
    ] = await Promise.all([
      this.getMonthlyRevenueTrend(12),
      this.getDefaultersList(),
      this.getClassWiseRevenue(),
      this.getPaymentMethodBreakdown(),
    ]);

    const totalBilled = classwise.reduce((sum, c) => sum + c.totalBilled, 0);
    const totalPaid = classwise.reduce((sum, c) => sum + c.totalPaid, 0);
    const totalOutstanding = classwise.reduce((sum, c) => sum + c.totalOutstanding, 0);

    return {
      summary: {
        totalBilled,
        totalPaid,
        totalOutstanding,
        overallCollectionRate: totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0,
        defaultersCount: defaulters.length,
        totalOverdueAmount: defaulters.reduce((sum, d) => sum + d.totalOverdue, 0),
      },
      monthlyTrend,
      defaulters,
      classwise,
      paymentMethods,
    };
  }

  /**
   * Get due alert (invoices due within N days)
   */
  async getDueAlerts(daysAhead: number = 7): Promise<Array<{
    studentId: number;
    studentName: string;
    invoiceNumber: string | null;
    amount: number;
    remainingBalance: number;
    dueDate: string;
    daysUntilDue: number;
  }>> {
    const fees = await storage.getFees();
    const today = new Date();
    const alertDate = new Date(today);
    alertDate.setDate(alertDate.getDate() + daysAhead);
    
    const alerts = fees
      .filter(fee => {
        if (fee.remainingBalance <= 0) return false;
        const dueDate = new Date(fee.dueDate);
        return dueDate > today && dueDate <= alertDate;
      })
      .map(fee => ({
        studentId: fee.studentId,
        studentName: fee.student?.name || "Unknown",
        invoiceNumber: fee.invoiceNumber,
        amount: fee.amount,
        remainingBalance: fee.remainingBalance,
        dueDate: fee.dueDate,
        daysUntilDue: Math.ceil((new Date(fee.dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
      }))
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
    
    return alerts;
  }
}

export const reportingService = new ReportingService();
