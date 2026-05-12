import { eq } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { users, students } from "../../../shared/schema.js";
import type { StudentRow } from "./validators.js";
import type { RowError } from "./validators.js";

export async function insertStudents(
  rows: StudentRow[],
  cnicToId: Map<string, number>,
  tx: PgTransaction<
    PostgresJsQueryResultHKT,
    typeof import("../../../shared/schema.js"),
    undefined
  >
): Promise<{ inserted: number; skipped: number; errors: RowError[] }> {
  const errors: RowError[] = [];
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const familyId = cnicToId.get(row.family_cnic);

    if (!familyId) {
      errors.push({
        row: i + 2,
        field: "family_cnic",
        value: row.family_cnic,
        reason: `No family found with CNIC "${row.family_cnic}". Upload the family first.`,
      });
      continue;
    }

    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, row.email))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const [user] = await tx
      .insert(users)
      .values({
        name: row.name,
        email: row.email,
        password: row.password,
        role: "student",
        className: row.class_name,
        fatherName: row.father_name || null,
        rollNumber: row.roll_number || null,
        dateOfBirth: row.date_of_birth || null,
        gender: row.gender,
        phone: row.phone || null,
        address: row.address || null,
        familyId: familyId,
      })
      .returning({ id: users.id });

    await tx.insert(students).values({
      userId: user.id,
      className: row.class_name,
    });

    inserted++;
  }

  return { inserted, skipped, errors };
}
