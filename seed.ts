import { db } from "./server/db";
import { users } from "./shared/schema";
import { count } from "drizzle-orm";

async function seed() {
  const [{ value }] = await db.select({ value: count() }).from(users);
  if (value === 0) {
    await db.insert(users).values([
      { name: "Admin User", email: "admin@school.com", password: "password", role: "admin" },
      { name: "Teacher User", email: "teacher@school.com", password: "password", role: "teacher", subject: "Math" },
      { name: "Student User", email: "student@school.com", password: "password", role: "student", className: "10A" },
    ]);
    console.log("Database seeded with default users.");
  } else {
    console.log("Database already has users, skipping seed.");
  }
}

seed().catch(console.error).finally(() => process.exit(0));
