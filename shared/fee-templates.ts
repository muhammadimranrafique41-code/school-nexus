import { z } from 'zod';
import { FeeCalculator, FeeCalculationInput } from './fee-calculator';

/**
 * Fee Template Schema Validation
 */
export const FeeTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional(),
  classTier: z.enum(['basic', 'premium', 'scholarship']),
  baseAmount: z.number().min(0, 'Base amount must be non-negative'),
  dueDay: z.number().min(1).max(31).default(15),
  isActive: z.boolean().default(true),
  metadata: z.record(z.any()).optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export type FeeTemplate = z.infer<typeof FeeTemplateSchema>;

/**
 * Fee Template Service
 * Manages fee templates and applies them to students
 */
export class FeeTemplateService {
  private templates: Map<string, FeeTemplate> = new Map();
  private calculator: FeeCalculator;

  constructor() {
    this.calculator = new FeeCalculator();
    this.initializeDefaultTemplates();
  }

  /**
   * Initialize default templates if none exist
   */
  private initializeDefaultTemplates() {
    const defaultTemplates: FeeTemplate[] = [
      {
        name: 'Basic Monthly Tuition',
        classTier: 'basic',
        baseAmount: 1000,
        dueDay: 15,
        isActive: true,
        description: 'Standard monthly tuition for basic tier students',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Premium Package',
        classTier: 'premium',
        baseAmount: 1500,
        dueDay: 15,
        isActive: true,
        description: 'Premium package with additional benefits',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Scholarship Waiver',
        classTier: 'scholarship',
        baseAmount: 0,
        dueDay: 15,
        isActive: true,
        description: 'Full scholarship waiver for qualifying students',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    defaultTemplates.forEach(t => {
      this.templates.set(t.name, this.validateTemplate(t));
    });
  }

  /**
   * Validate and sanitize template
   */
  private validateTemplate(template: FeeTemplate): FeeTemplate {
    const result = FeeTemplateSchema.parse(template);
    return result;
  }

  /**
   * Create a new fee template
   */
  async createTemplate(template: Omit<FeeTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<FeeTemplate> {
    const validatedTemplate = this.validateTemplate({
      ...template,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    this.templates.set(validatedTemplate.name, validatedTemplate);
    return validatedTemplate;
  }

  /**
   * Update an existing template
   */
  async updateTemplate(name: string, updates: Partial<FeeTemplate>): Promise<FeeTemplate | null> {
    const existing = this.templates.get(name);
    if (!existing) return null;

    const updated = this.validateTemplate({
      ...existing,
      ...updates,
      updatedAt: new Date()
    });

    this.templates.set(name, updated);
    return updated;
  }

  /**
   * Delete a template
   */
  async deleteTemplate(name: string): Promise<boolean> {
    return this.templates.delete(name);
  }

  /**
   * Get all active templates
   */
  async getActiveTemplates(): Promise<FeeTemplate[]> {
    return Array.from(this.templates.values()).filter(t => t.isActive);
  }

  /**
   * Generate fee using a template
   *
   * @param templateName - The name of the template to use
   * @param input - Additional fee calculation parameters
   */
  async generateFeeFromTemplate(
    templateName: string,
    input: FeeCalculationInput & { additionalFees?: Record<string, number> }
  ): Promise<FeeRecord> {
    const template = this.templates.get(templateName);
    if (!template) throw new Error(`Template '${templateName}' not found`);
    if (!template.isActive) throw new Error(`Template '${templateName}' is inactive`);

    // Merge template defaults with provided input
    const mergedInput: FeeCalculationInput = {
      studentId: input.studentId,
      classTier: template.classTier,
      scholarshipPercentage: input.scholarshipPercentage,
      additionalFees: input.additionalFees,
      overrideDueDate: input.overrideDueDate
    };

    // Build due date based on template due day
    const dueDate = this.buildDueDateFromDay(template.dueDay, input.overrideDueDate);
    mergedInput.overrideDueDate = dueDate;

    // Generate fee using calculator
    const fee = await this.calculator.calculateFee(mergedInput);
    return fee;
  }

  /**
   * Build due date from a day number (e.g., 15th)
   */
  private buildDueDateFromDay(day: number, override?: string): string {
    if (override) return override;

    const now = new Date();
    const nextMonth = now.getMonth() + 1;
    const year = now.getFullYear();
    const dueYear = nextMonth > 12 ? year + 1 : year;
    const dueMonth = nextMonth > 12 ? 1 : nextMonth;

    // Cap day at max days in month
    const maxDay = new Date(dueYear, dueMonth, 0).getDate();
    const dueDay = Math.min(day, maxDay);

    return new Date(dueYear, dueMonth - 1, dueDay).toISOString();
  }

  /**
   * Apply template to multiple students (bulk generation)
   */
  async generateBulkFromTemplate(
    templateName: string,
    studentIds: string[],
    options?: {
      scholarshipPercentage?: number;
      additionalFees?: Record<string, number>;
      dueDateOverrides?: Record<string, string>;
    }
  ): Promise<FeeRecord[]> {
    const results: FeeRecord[] = [];
    const errors: { studentId: string; error: string }[] = [];

    for (const studentId of studentIds) {
      try {
        const input: FeeCalculationInput & { additionalFees?: Record<string, number> } = {
          studentId,
          classTier: 'basic', // Will be overridden by template
          scholarshipPercentage: options?.scholarshipPercentage,
          additionalFees: options?.additionalFees,
          overrideDueDate: options?.dueDateOverrides?.[studentId]
        };

        const fee = await this.generateFeeFromTemplate(templateName, input);
        results.push({ ...fee, feeType: 'templated' });
      } catch (error: any) {
        errors.push({ studentId, error: error.message });
      }
    }

    return results;
  }
}