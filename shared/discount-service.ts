import { z } from 'zod';

/**
 * Discount Code Schema
 */
export const DiscountCodeSchema = z.object({
  id: z.string().optional(),
  code: z.string().upper().min(1, 'Code is required'),
  description: z.string().optional(),
  type: z.enum(['percentage', 'fixed']),
  value: z.number().min(0, 'Discount value must be non-negative'),
  maxUses: z.number().int().min(1).optional(),
  usedCount: z.number().int().min(0).default(0),
  validFrom: z.date().default(() => new Date()),
  validUntil: z.date().optional(),
  isActive: z.boolean().default(true),
  appliesToFeeTypes: z.array(z.string()).optional(), // e.g., ['monthly', 'activity']
  metadata: z.record(z.any()).optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type DiscountCode = z.infer<typeof DiscountCodeSchema>;

export class DiscountService {
  private discountCodes: Map<string, DiscountCode> = new Map();

  constructor() {
    this.initializeDefaults();
  }

  private initializeDefaults() {
    // Example: early bird discount
    const earlyBird: DiscountCode = {
      id: 'early-bird-2024',
      code: 'EARLY10',
      description: '10% early registration discount',
      type: 'percentage',
      value: 10,
      maxUses: 100,
      usedCount: 0,
      validFrom: new Date('2024-01-01'),
      validUntil: new Date('2024-12-31'),
      isActive: true,
      appliesToFeeTypes: ['monthly'],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.discountCodes.set(earlyBird.code, earlyBird);
  }

  /**
   * Validate discount code applicability
   */
  async validateDiscount(
    code: string,
    feeAmount: number,
    feeType?: string,
    studentId?: string
  ): Promise<{
    valid: boolean;
    discount?: number;
    finalAmount?: number;
    error?: string;
  }> {
    const normalizedCode = code.trim().toUpperCase();
    const discount = this.discountCodes.get(normalizedCode);

    // Check existence
    if (!discount) {
      return { valid: false, error: 'Invalid discount code' };
    }

    // Check active status
    if (!discount.isActive) {
      return { valid: false, error: 'Discount code is no longer active' };
    }

    // Check validity period
    const now = new Date();
    if (discount.validFrom && now < discount.validFrom) {
      return { valid: false, error: 'Discount code is not yet valid' };
    }
    if (discount.validUntil && now > discount.validUntil) {
      return { valid: false, error: 'Discount code has expired' };
    }

    // Check usage limit
    if (discount.maxUses && discount.usedCount >= discount.maxUses) {
      return { valid: false, error: 'Discount code usage limit reached' };
    }

    // Check fee type restriction
    if (discount.appliesToFeeTypes && feeType && !discount.appliesToFeeTypes.includes(feeType)) {
      return { valid: false, error: `Discount does not apply to fee type: ${feeType}` };
    }

    // Prevent fraud: ensure per-student discount usage not exceeded
    if (studentId && discount.metadata?.perStudentLimit) {
      const studentUsage = discount.metadata.studentUsage?.[studentId] || 0;
      if (studentUsage >= discount.metadata.perStudentLimit) {
        return { valid: false, error: 'Discount usage limit exceeded for this student' };
      }
    }

    // Calculate discount
    let discountAmount: number;
    if (discount.type === 'percentage') {
      discountAmount = feeAmount * (discount.value / 100);
    } else {
      discountAmount = Math.min(discount.value, feeAmount); // Fixed discount cannot exceed fee
    }

    const finalAmount = Math.max(feeAmount - discountAmount, 0);

    return {
      valid: true,
      discount: discountAmount,
      finalAmount
    };
  }

  /**
   * Apply discount code and increment usage
   */
  async applyDiscount(
    code: string,
    feeId: string,
    studentId: string,
    recorderId: string
  ): Promise<{
    success: boolean;
    discountApplied: number;
    remainingUses?: number;
    error?: string;
  }> {
    const normalizedCode = code.trim().toUpperCase();
    const discount = this.discountCodes.get(normalizedCode);
    if (!discount) {
      return { success: false, error: 'Discount code not found' };
    }

    // Validate again before applying
    const validation = await this.validateDiscount(code, 0, undefined, studentId);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Record usage
    discount.usedCount += 1;

    // Track per-student usage if needed
    if (!discount.metadata) discount.metadata = {};
    if (!discount.metadata.studentUsage) discount.metadata.studentUsage = {};
    discount.metadata.studentUsage[studentId] = (discount.metadata.studentUsage[studentId] || 0) + 1;

    // Update in map
    this.discountCodes.set(normalizedCode, discount);

    return {
      success: true,
      discountApplied: validation.discount || 0,
      remainingUses: discount.maxUses ? discount.maxUses - discount.usedCount : undefined
    };
  }

  /**
   * Create a new discount code
   */
  async createDiscount(discount: Omit<DiscountCode, 'id' | 'createdAt' | 'updatedAt' | 'usedCount'>): Promise<DiscountCode> {
    const validatedDiscount = DiscountCodeSchema.parse({
      ...discount,
      usedCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    if (this.discountCodes.has(validatedDiscount.code)) {
      throw new Error(`Discount code '${validatedDiscount.code}' already exists`);
    }

    this.discountCodes.set(validatedDiscount.code, validatedDiscount);
    return validatedDiscount;
  }

  /**
   * Update existing discount
   */
  async updateDiscount(code: string, updates: Partial<DiscountCode>): Promise<DiscountCode | null> {
    const existing = this.discountCodes.get(code);
    if (!existing) return null;

    const updated = DiscountCodeSchema.parse({
      ...existing,
      ...updates,
      updatedAt: new Date()
    });

    this.discountCodes.set(code, updated);
    return updated;
  }

  /**
   * Get discount usage statistics
   */
  async getDiscountStats(): Promise<Array<{
    code: string;
    description: string;
    usedCount: number;
    maxUses: number | null;
    validUntil: Date | null;
    isActive: boolean;
  }>> {
    return Array.from(this.discountCodes.values())
      .map(d => ({
        code: d.code,
        description: d.description || '',
        usedCount: d.usedCount,
        maxUses: d.maxUses,
        validUntil: d.validUntil,
        isActive: d.isActive
      }));
  }
}