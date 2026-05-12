import { db } from "../db.js";
import { parseBuffer } from "./import/fileParser.js";
import { upsertFamilies, resolveFamilyIds } from "./import/familyImporter.js";
import { insertStudents } from "./import/studentImporter.js";
import {
  validateFamilyRows,
  validateStudentRows,
} from "./import/validators.js";
import type { RowError } from "./import/validators.js";

export interface ImportResponse {
  success: boolean;
  imported: number;
  skipped: number;
  errors: RowError[];
  message: string;
}

export async function importFamilies(
  buffer: Buffer,
  mimetype: string
): Promise<ImportResponse> {
  const rows = parseBuffer(buffer, mimetype);
  const { valid, errors } = validateFamilyRows(rows);

  if (errors.length > 0 && valid.length === 0) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      errors,
      message: "Validation failed. No valid rows to import.",
    };
  }

  let imported = 0;
  let skipped = rows.length - valid.length;

  await db.transaction(async (tx) => {
    const cnicMap = await upsertFamilies(valid, tx);
    imported = cnicMap.size;
  });

  return {
    success: true,
    imported,
    skipped,
    errors,
    message: `${imported} families imported successfully.`,
  };
}

export async function importStudents(
  buffer: Buffer,
  mimetype: string
): Promise<ImportResponse> {
  const rows = parseBuffer(buffer, mimetype);
  const { valid, errors } = validateStudentRows(rows);

  if (errors.length > 0 && valid.length === 0) {
    return {
      success: false,
      imported: 0,
      skipped: 0,
      errors,
      message: "Validation failed. No valid rows to import.",
    };
  }

  let imported = 0;
  let skipped = rows.length - valid.length;

  await db.transaction(async (tx) => {
    const allFamilyCnics = [...new Set(valid.map((r) => r.family_cnic))];
    const cnicMap = await resolveFamilyIds(allFamilyCnics, tx);

    const result = await insertStudents(valid, cnicMap, tx);
    imported = result.inserted;
    skipped += result.skipped;
    errors.push(...result.errors);

    if (result.errors.length > 0) {
      throw new Error("PARTIAL_FAILURE");
    }
  }).catch(() => {});

  return {
    success: errors.length === 0,
    imported,
    skipped,
    errors,
    message: `${imported} students imported.`,
  };
}
