import { z } from "zod";

export const CreateClassSchema = z.object({
  grade: z.string().min(1).max(10),
  section: z.string().min(1).max(5),
  stream: z.string().max(20).optional(),
  academicYear: z
    .string()
    .regex(/^\d{4}-\d{4}$/, "Academic year must be in the format YYYY-YYYY"),
  capacity: z.coerce.number().int().min(20).max(60),
});

export const AssignTeacherSchema = z.object({
  teacherId: z.coerce.number().int().positive(),
  subjects: z.array(z.string().min(1).max(50)).min(1).max(5),
  periodsPerWeek: z.number().int().min(1).max(8),
  priority: z.number().int().min(1).max(5).default(3),
});

export const AssignClassTeachersSchema = z
  .object({
    classId: z.coerce.number().int().positive(),
    teachers: z.array(AssignTeacherSchema).min(1).max(6),
  })
  .superRefine((data, ctx) => {
    const totalPeriods = data.teachers.reduce(
      (sum, teacher) => sum + teacher.periodsPerWeek,
      0,
    );

    if (totalPeriods > 40) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Total periods per class per week cannot exceed 40",
        path: ["teachers"],
      });
    }
  });

