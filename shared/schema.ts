import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull(), // 'admin', 'teacher', 'student'
  subject: text("subject"), // For teachers
  className: text("class_name"), // For students
});

export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  teacherId: integer("teacher_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  status: text("status").notNull(), // 'Present', 'Absent'
});

export const results = pgTable("results", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  subject: text("subject").notNull(),
  marks: integer("marks").notNull(),
  grade: text("grade").notNull(),
});

export const fees = pgTable("fees", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull(),
  amount: integer("amount").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull(), // 'Paid', 'Unpaid'
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertAttendanceSchema = createInsertSchema(attendance).omit({ id: true });
export const insertResultSchema = createInsertSchema(results).omit({ id: true });
export const insertFeeSchema = createInsertSchema(fees).omit({ id: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Attendance = typeof attendance.$inferSelect;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Result = typeof results.$inferSelect;
export type InsertResult = z.infer<typeof insertResultSchema>;
export type Fee = typeof fees.$inferSelect;
export type InsertFee = z.infer<typeof insertFeeSchema>;

export type AttendanceWithStudent = Attendance & { student?: User };
export type ResultWithStudent = Result & { student?: User };
export type FeeWithStudent = Fee & { student?: User };
