import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "../db.js";
import { subjects } from "../../shared/schema.js";

export type Subject = typeof subjects.$inferSelect;
export type CreateSubjectInput = { name: string; code?: string | null; description?: string | null };
export type UpdateSubjectInput = Partial<CreateSubjectInput>;

export class SubjectServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "SubjectServiceError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertNameUnique(name: string, excludeId?: number): Promise<void> {
  const [existing] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      excludeId
        ? and(eq(subjects.name, name), ne(subjects.id, excludeId))
        : eq(subjects.name, name),
    )
    .limit(1);
  if (existing) {
    throw new SubjectServiceError(
      `A subject named "${name}" already exists.`,
      "SUBJECT_NAME_CONFLICT",
      409,
    );
  }
}

async function assertCodeUnique(code: string, excludeId?: number): Promise<void> {
  const [existing] = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(
      excludeId
        ? and(eq(subjects.code, code), ne(subjects.id, excludeId))
        : eq(subjects.code, code),
    )
    .limit(1);
  if (existing) {
    throw new SubjectServiceError(
      `A subject with code "${code}" already exists.`,
      "SUBJECT_CODE_CONFLICT",
      409,
    );
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function listSubjects(): Promise<Subject[]> {
  return db.select().from(subjects).orderBy(asc(subjects.name));
}

export async function getSubjectById(id: number): Promise<Subject> {
  const [row] = await db.select().from(subjects).where(eq(subjects.id, id)).limit(1);
  if (!row) {
    throw new SubjectServiceError("Subject not found.", "SUBJECT_NOT_FOUND", 404);
  }
  return row;
}

export async function createSubject(input: CreateSubjectInput): Promise<Subject> {
  const name = input.name.trim();
  const code = input.code?.trim() || null;
  const description = input.description?.trim() || null;

  await assertNameUnique(name);
  if (code) await assertCodeUnique(code);

  const [row] = await db
    .insert(subjects)
    .values({ name, code, description })
    .returning();
  return row;
}

export async function updateSubject(id: number, input: UpdateSubjectInput): Promise<Subject> {
  await getSubjectById(id); // throws 404 if not found

  const patch: Partial<typeof subjects.$inferInsert> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    await assertNameUnique(name, id);
    patch.name = name;
  }

  if (input.code !== undefined) {
    const code = input.code?.trim() || null;
    if (code) await assertCodeUnique(code, id);
    patch.code = code;
  }

  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }

  const [row] = await db
    .update(subjects)
    .set(patch)
    .where(eq(subjects.id, id))
    .returning();
  return row;
}

export async function deleteSubject(id: number): Promise<void> {
  await getSubjectById(id); // throws 404 if not found
  await db.delete(subjects).where(eq(subjects.id, id));
}
