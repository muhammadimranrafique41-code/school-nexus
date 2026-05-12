import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { db } from "../../db.js";
import { families } from "../../../shared/schema.js";
import type { FamilyRow } from "./validators.js";

export async function upsertFamilies(
  rows: FamilyRow[],
  tx: PgTransaction<PostgresJsQueryResultHKT, typeof import("../../../shared/schema.js"), undefined>
): Promise<Map<string, number>> {
  const cnicToId = new Map<string, number>();

  for (const row of rows) {
    const existing = await tx
      .select({ id: families.id })
      .from(families)
      .where(
        sql`${families.guardianDetails}->'primary'->>'cnic' = ${row.cnic}`
      )
      .limit(1);

    if (existing.length > 0) {
      cnicToId.set(row.cnic, existing[0].id);
      continue;
    }

    const timestamp = new Date().toISOString();
    const [inserted] = await tx
      .insert(families)
      .values({
        name: row.family_name,
        guardianDetails: {
          primary: {
            name: row.guardian_name,
            phone: row.phone,
            email: row.email,
            address: row.address,
            cnic: row.cnic,
          },
        },
        walletBalance: "0",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning({ id: families.id });

    cnicToId.set(row.cnic, inserted.id);
  }

  return cnicToId;
}

export async function resolveFamilyIds(
  cnics: string[],
  tx: PgTransaction<PostgresJsQueryResultHKT, typeof import("../../../shared/schema.js"), undefined>
): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  for (const cnic of cnics) {
    const [family] = await tx
      .select({ id: families.id })
      .from(families)
      .where(
        sql`${families.guardianDetails}->'primary'->>'cnic' = ${cnic}`
      )
      .limit(1);

    if (family) {
      map.set(cnic, family.id);
    }
  }

  return map;
}
