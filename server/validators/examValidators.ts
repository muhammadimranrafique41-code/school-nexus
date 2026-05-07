import { z } from "zod";

const dateInput = z.coerce.date();

export const createExamSessionSchema = z
  .object({
    academicSessionId: z.coerce.number().int().positive(),
    classId: z.coerce.number().int().positive(),
    examType: z.enum(["MAT", "HALF_YEARLY", "ANNUAL"]),
    monthLabel: z.string().trim().max(80).optional(),
    title: z.string().trim().min(1).max(160),
    startDate: dateInput,
    endDate: dateInput,
    totalMarks: z.coerce.number().int().positive(),
    passingMarks: z.coerce.number().int().nonnegative(),
    subjects: z
      .array(
        z.object({
          subjectName: z.string().trim().min(1).max(120),
          subjectCode: z.string().trim().max(40).optional(),
          maxTheoryMarks: z.coerce.number().int().positive(),
          maxPracticalMarks: z.coerce.number().int().nonnegative().optional().default(0),
          examDate: dateInput,
          examTime: z.string().trim().max(80).optional(),
          venue: z.string().trim().max(120).optional(),
          sortOrder: z.coerce.number().int().nonnegative().optional(),
        })
      )
      .min(1),
  })
  .refine((value) => value.passingMarks < value.totalMarks, {
    path: ["passingMarks"],
    message: "Passing marks must be less than total marks",
  })
  .refine((value) => value.examType !== "MAT" || Boolean(value.monthLabel?.trim()), {
    path: ["monthLabel"],
    message: "Month label is required for MAT exams",
  })
  .refine((value) => value.endDate >= value.startDate, {
    path: ["endDate"],
    message: "End date must be on or after start date",
  });

export const bulkMarksSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: z.coerce.number().int().positive(),
        theoryMarks: z.coerce.number().min(0).optional(),
        practicalMarks: z.coerce.number().min(0).optional(),
        isAbsent: z.boolean().optional().default(false),
        isExempted: z.boolean().optional().default(false),
        remarks: z.string().trim().max(500).optional(),
      })
    )
    .min(1),
});

export const marksheetQuerySchema = z.object({
  examSessionId: z.coerce.number().int().positive(),
  studentId: z.coerce.number().int().positive().optional(),
  studentIds: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(",")
            .map((item) => Number.parseInt(item.trim(), 10))
            .filter((item) => Number.isFinite(item) && item > 0)
        : []
    ),
});

export const examSessionListQuerySchema = z.object({
  classId: z.coerce.number().int().positive().optional(),
});

export const matAggregateQuerySchema = z.object({
  classId: z.coerce.number().int().positive(),
  academicSessionId: z.coerce.number().int().positive(),
  bestOf: z.coerce.number().int().positive().max(12).default(5),
  outOf: z.coerce.number().positive().default(50),
});
