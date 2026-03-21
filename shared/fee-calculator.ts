export interface FeeCalculationInput {
  studentId: string;
  classTier: 'basic' | 'premium' | 'scholarship';
  scholarshipPercentage?: number;
  additionalFees?: { [key: string]: number };
  overrideDueDate?: string; // ISO format date
}

export interface FeeRecord {
  studentId: string;
  amount: number;
  dueDate: string; // ISO format date
  feeType: string;
  generated: string;
  description: string;
}

class FeeCalculator {
  private getBaseFee(classTier: string): number {
    return {
      basic: 1000,
      premium: 1500,
      scholarship: 0
    }[classTier] || 1000;
  }

  calculateFee(input: FeeCalculationInput): FeeRecord {
    if (!input.studentId) throw new Error('Student ID required');
    const base = this.getBaseFee(input.classTier || 'basic');
    let fee = base * (input.scholarshipPercentage || 0) / 100;
    if (input.additionalFees) {
      fee += Object.values(input.additionalFees).reduce((a, v) => a + v, 0);
    }
    fee = Math.max(fee, 0);
    const dueDate = input.overrideDueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    return {
      ...input,
      amount: fee,
      dueDate,
      feeType: 'dynamic',
      generated: new Date().toISOString(),
      description: `Class: ${input.classTier}, Scholarship: ${input.scholarshipPercentage}%, Additional: ${JSON.stringify(input.additionalFees)}`
    };
  }
}