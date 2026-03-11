import type { InsertUser } from "../shared/schema.js";

export const defaultSeedUsers: InsertUser[] = [
  { name: "John Admin", email: "admin@school.edu", password: "password123", role: "admin" },
  { name: "Dr. Sarah Mitchell", email: "s.mitchell@school.edu", password: "password123", role: "teacher", subject: "Mathematics", designation: "Head of Mathematics", department: "STEM Faculty", employeeId: "SNX-T-001" },
  { name: "Prof. Michael Chen", email: "m.chen@school.edu", password: "password123", role: "teacher", subject: "Physics", designation: "Senior Physics Teacher", department: "Science Department", employeeId: "SNX-T-002" },
  { name: "Emily Rodriquez", email: "e.rodriguez@school.edu", password: "password123", role: "teacher", subject: "Literature", designation: "Language Arts Teacher", department: "Humanities Department", employeeId: "SNX-T-003" },
  { name: "David Thompson", email: "d.thompson@school.edu", password: "password123", role: "teacher", subject: "History", designation: "History Teacher", department: "Humanities Department", employeeId: "SNX-T-004" },
  { name: "Alex Rivera", email: "a.rivera@student.edu", password: "password123", role: "student", className: "Grade 10-A" },
  { name: "Chloe Bennett", email: "c.bennett@student.edu", password: "password123", role: "student", className: "Grade 10-A" },
  { name: "Marcus Wright", email: "m.wright@student.edu", password: "password123", role: "student", className: "Grade 11-B" },
  { name: "Sophia Garcia", email: "s.garcia@student.edu", password: "password123", role: "student", className: "Grade 12-C" },
  { name: "Jordan Lee", email: "j.lee@student.edu", password: "password123", role: "student", className: "Grade 9-D" },
];

export const defaultSeedAdminEmail = "admin@school.edu";
export const defaultSeedUserEmails = defaultSeedUsers.map((user) => user.email);

export function getMissingDefaultUsers(existingEmails: Iterable<string>) {
  const existingEmailSet = new Set(Array.from(existingEmails, (email) => email.trim().toLowerCase()));
  return defaultSeedUsers.filter((user) => !existingEmailSet.has(user.email.toLowerCase()));
}