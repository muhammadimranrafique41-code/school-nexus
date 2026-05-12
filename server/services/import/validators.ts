import { z } from "zod";

export interface RowError {
  row: number;
  field: string;
  value: string;
  reason: string;
}

export interface ValidationResult<T> {
  valid: T[];
  errors: RowError[];
}

export const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;

export const FamilyRowSchema = z.object({
  family_name: z.string().min(1, "Family name is required"),
  guardian_name: z.string().min(2, "Guardian name too short"),
  phone: z.string().min(10, "Invalid phone number"),
  email: z.string().email("Invalid email address"),
  address: z.string().min(5, "Address too short"),
  cnic: z.string().regex(cnicRegex, "Invalid CNIC format (XXXXX-XXXXXXX-X)"),
});

export const StudentRowSchema = z.object({
  name: z.string().min(2, "Name too short"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  class_name: z.string().min(1, "Class name is required"),
  father_name: z.string().optional().default(""),
  roll_number: z.string().optional().default(""),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
    .optional()
    .default(""),
  gender: z.enum(["male", "female", "other"], {
    errorMap: () => ({ message: "Must be 'male', 'female', or 'other'" }),
  }),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  family_cnic: z.string().regex(cnicRegex, "Invalid family CNIC format"),
});

export type FamilyRow = z.infer<typeof FamilyRowSchema>;
export type StudentRow = z.infer<typeof StudentRowSchema>;

function validateRows<T>(
  rows: unknown[],
  schema: z.ZodSchema<T>
): ValidationResult<T> {
  const valid: T[] = [];
  const errors: RowError[] = [];

  rows.forEach((row, index) => {
    const result = schema.safeParse(row);
    if (result.success) {
      valid.push(result.data);
    } else {
      result.error.errors.forEach((err) => {
        errors.push({
          row: index + 2,
          field: (err.path[0] as string) ?? "unknown",
          value: (row as Record<string, string>)[err.path[0] as string] ?? "",
          reason: err.message,
        });
      });
    }
  });

  return { valid, errors };
}

export function validateFamilyRows(
  rows: unknown[]
): ValidationResult<FamilyRow> {
  return validateRows(rows, FamilyRowSchema);
}

export function validateStudentRows(
  rows: unknown[]
): ValidationResult<StudentRow> {
  return validateRows(rows, StudentRowSchema);
}
