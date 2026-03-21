import { z } from 'zod';

/**
 * Discount Application Interface
 */
export const DiscountApplicationSchema = z.object({
  studentId: z.string(),
  feeId: z.string(),
  discountCode: z.string(),
  appliedBy: z.string(), // Admin user ID
  discountAmount: z.number().min(0),
  originalAmount: z.number().min(0),
  finalAmount: z.number().min(0),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().min(0),
  reason: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type DiscountApplication = z.infer<typeof DiscountApplicationSchema>;

/**
 * Discount Interface Service
 * Provides UI-friendly interfaces for discount management
 */
export class DiscountInterfaceService {
  private discountService: DiscountService;

  constructor() {
    this.discountService = new DiscountService();
  }

  /**
   * Get available discounts for a student
   */
  async getAvailableDiscountsForStudent(studentId: string): Promise<Array<{
    code: string;
    description: string;
    type: string;
    value: number;
    remainingUses: number | null;
    expiresIn: string;
    appliesTo: string[];
  }>> {
    const codes = Array.from(this.discountService.discountCodes.values());
    const now = new Date();

    return codes
      .filter(code => code.isActive)
      .map(code => ({
        code: code.code,
        description: code.description || 'No description',
        type: code.type,
        value: code.value,
        remainingUses: code.maxUses ? code.maxUses - code.usedCount : null,
        expiresIn: code.validUntil ? this.calculateTimeUntil(code.validUntil) : 'No expiration',
        appliesTo: code.appliesToFeeTypes || ['All fee types']
      }));
  }

  /**
   * Apply discount through admin interface
   */
  async applyDiscountThroughInterface(
    studentId: string,
    feeId: string,
    discountCode: string,
    adminId: string,
    reason?: string
  ): Promise<{
    success: boolean;
    feeRecord: any;
    discountInfo: any;
    error?: string;
  }> {
    try {
      // Validate student exists
      const student = await this.validateStudentExists(studentId);
      if (!student) {
        return { success: false, error: 'Student not found' };
      }

      // Validate fee exists
      const fee = await this.validateFeeExists(feeId);
      if (!fee) {
        return { success: false, error: 'Fee record not found' };
      }

      // Validate discount
      const discountValidation = await this.discountService.validateDiscount(
        discountCode,
        fee.amount,
        fee.feeType,
        studentId
      );

      if (!discountValidation.valid) {
        return { success: false, error: discountValidation.error };
      }

      // Apply discount
      const discountResult = await this.discountService.applyDiscount(
        discountCode,
        feeId,
        studentId,
        adminId
      );

      if (!discountResult.success) {
        return { success: false, error: discountResult.error };
      }

      // Create discount application record
      const discountApplication = this.createDiscountApplicationRecord(
        studentId,
        feeId,
        discountCode,
        adminId,
        discountValidation.discount,
        fee.amount,
        discountValidation.finalAmount,
        discountValidation.discountValue,
        discountValidation.discountType,
        reason
      );

      // Update fee record with discount applied
      const updatedFee = await this.updateFeeWithDiscount(fee, discountApplication);

      return {
        success: true,
        feeRecord: updatedFee,
        discountInfo: {
          discountCode,
          discountAmount: discountValidation.discount,
          finalAmount: discountValidation.finalAmount,
          remainingUses: discountResult.remainingUses
        }
      };

    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private validateStudentExists(studentId: string): Promise<boolean> {
    // This would be a database call
    // For now, assume all studentIds are valid
    return Promise.resolve(true);
  }

  private validateFeeExists(feeId: string): Promise<any> {
    // This would be a database call
    // For now, assume all feeIds are valid
    return Promise.resolve({ amount: 1000, feeType: 'monthly' });
  }

  private createDiscountApplicationRecord(
    studentId: string,
    feeId: string,
    discountCode: string,
    appliedBy: string,
    discountAmount: number,
    originalAmount: number,
    finalAmount: number,
    discountValue: number,
    discountType: string,
    reason?: string
  ): DiscountApplication {
    return {
      studentId,
      feeId,
      discountCode,
      appliedBy,
      discountAmount,
      originalAmount,
      finalAmount,
      discountType,
      discountValue,
      reason,
      metadata: {
        appliedAt: new Date().toISOString(),
        appliedBy: appliedBy
      }
    };
  }

  private updateFeeWithDiscount(fee: any, discountApplication: DiscountApplication): Promise<any> {
    // This would update the fee record in database
    // For now, return modified fee
    return Promise.resolve({
      ...fee,
      amount: discountApplication.finalAmount,
      discountApplied: discountApplication.discountAmount,
      finalAmount: discountApplication.finalAmount
    });
  }

  private calculateTimeUntil(date: Date): string {
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 30) return 'More than 30 days';
    if (diffDays > 0) return `${diffDays} days`;
    if (diffDays === 0) return 'Today';
    return 'Expired';
  }

  /**
   * Generate discount usage report
   */
  async generateDiscountUsageReport(): Promise<Array<{
    code: string;
    totalUsage: number;
    totalDiscountAmount: number;
    averageDiscount: number;
    mostUsedBy: string[];
    successRate: number;
  }>> {
    const report: Array<{
      code: string;
      totalUsage: number;
      totalDiscountAmount: number;
      averageDiscount: number;
      mostUsedBy: string[];
      successRate: number;
    }> = [];

    // This would query the database for actual usage
    // For now, return mock data
    return report;
  }
}