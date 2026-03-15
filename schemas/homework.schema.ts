import { z } from "zod";

export const homeworkPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export const homeworkStatusSchema = z.enum(["active", "completed", "cancelled"]);

const trimmedString = (label: string, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string({ required_error: `${label} is required` }).min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`),
  );

const optionalTrimmedString = (label: string, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().max(max, `${label} must be at most ${max} characters`).nullable().optional(),
  );

const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be in YYYY-MM-DD format")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date.getTime() > today.getTime();
  }, "Due date must be in the future");

export const homeworkFileKeySchema = z
  .string()
  .min(1, "File key is required")
  .max(255, "File key must be at most 255 characters");

export const CreateHomeworkSchema = z.object({
  classId: z.coerce.number().int().positive("Class is required"),
  subject: trimmedString("Subject", 50),
  title: trimmedString("Title", 100),
  description: optionalTrimmedString("Instructions", 2000),
  dueDate: dueDateSchema,
  priority: homeworkPrioritySchema.default("medium"),
  files: z.array(homeworkFileKeySchema).max(10, "You can upload up to 10 files").default([]),
});

export const UpdateHomeworkSchema = CreateHomeworkSchema.partial().extend({
  status: homeworkStatusSchema.optional(),
});

export const GradeSubmissionSchema = z.object({
  marks: z.coerce.number().min(0, "Marks must be at least 0").max(100, "Marks cannot exceed 100"),
  feedback: z.string().max(500, "Feedback must be at most 500 characters"),
});

export const HomeworkListQuerySchema = z.object({
  classId: z.coerce.number().int().positive().optional(),
  status: homeworkStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateHomeworkInput = z.infer<typeof CreateHomeworkSchema>;
export type UpdateHomeworkInput = z.infer<typeof UpdateHomeworkSchema>;
export type GradeSubmissionInput = z.infer<typeof GradeSubmissionSchema>;
export type HomeworkListQuery = z.infer<typeof HomeworkListQuerySchema>;
