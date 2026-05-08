/**
 * ClassesService – Classes & Session Management
 *
 * Provides all business logic for:
 *  - Academic session CRUD (create, list, get, update, set-current)
 *  - Student promotion (move a student from one class to another with an
 *    immutable audit trail in promotion_history)
 *  - Bulk promotion (promote every student in a class to a target class)
 *  - Promotion history queries (per-student and per-class)
 *
 * Follows the same patterns as aiService.ts and feeService.ts:
 *  - Drizzle ORM for all DB access (no raw SQL strings)
 *  - Strict TypeScript types throughout
 *  - Descriptive error messages surfaced as typed errors
 *  - No side-effects beyond the DB transaction
 */

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db.js";
import {
  academicSessions,
  classes,
  promotionHistory,
  users,
  type AcademicSession,
  type Class,
  type InsertAcademicSession,
  type PromotionHistory,
  type User,
} from "../../shared/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Typed error class
// ─────────────────────────────────────────────────────────────────────────────

export class ClassesServiceError extends Error {
  constructor(
    message: string,
    /** HTTP-friendly status code hint for the route layer */
    public readonly statusCode: 400 | 404 | 409 | 422 | 500 = 500
  ) {
    super(message);
    this.name = "ClassesServiceError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────────────────────────────────────

export type CreateSessionInput = {
  name: string;       // e.g. "2025-2026"
  startDate: string;  // ISO date string "YYYY-MM-DD"
  endDate: string;
  isCurrent?: boolean;
};

export type UpdateSessionInput = Partial<CreateSessionInput>;

export type PromoteStudentInput = {
  studentId: number;
  toClassId: number;
  academicSessionId?: number;
  promotedBy: number;   // user id of the admin performing the action
  notes?: string;
  promotionDate?: string; // ISO date, defaults to today
};

export type BulkPromoteInput = {
  /** Source class – all active students in this class will be promoted */
  fromClassId: number;
  /** Destination class */
  toClassId: number;
  academicSessionId?: number;
  promotedBy: number;
  notes?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Rich return types (joined data)
// ─────────────────────────────────────────────────────────────────────────────

export type PromotionHistoryRecord = PromotionHistory & {
  student: Pick<User, "id" | "name" | "className"> | null;
  fromClass: Pick<Class, "id" | "grade" | "section"> | null;
  toClass: Pick<Class, "id" | "grade" | "section"> | null;
  promotedByUser: Pick<User, "id" | "name"> | null;
  session: Pick<AcademicSession, "id" | "name"> | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a human-readable class label ("Grade 10 A")
// ─────────────────────────────────────────────────────────────────────────────

function classLabel(cls: Pick<Class, "grade" | "section">): string {
  return `${cls.grade} ${cls.section}`.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Academic Session operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List all academic sessions, most recent first.
 */
export async function listAcademicSessions(): Promise<AcademicSession[]> {
  return db
    .select()
    .from(academicSessions)
    .orderBy(desc(academicSessions.startDate));
}

/**
 * Get a single academic session by id.
 * Throws ClassesServiceError(404) if not found.
 */
export async function getAcademicSession(id: number): Promise<AcademicSession> {
  const [row] = await db
    .select()
    .from(academicSessions)
    .where(eq(academicSessions.id, id))
    .limit(1);

  if (!row) {
    throw new ClassesServiceError(`Academic session #${id} not found`, 404);
  }
  return row;
}

/**
 * Get the currently active academic session.
 * Returns the session marked is_current=true, or falls back to the most
 * recently started session if none is explicitly marked current.
 */
export async function getCurrentAcademicSession(): Promise<AcademicSession | null> {
  // Try the explicitly-marked current session first
  const [current] = await db
    .select()
    .from(academicSessions)
    .where(eq(academicSessions.isCurrent, true))
    .limit(1);

  if (current) return current;

  // Fallback: return the most recently started session
  const [latest] = await db
    .select()
    .from(academicSessions)
    .orderBy(desc(academicSessions.startDate))
    .limit(1);

  return latest ?? null;
}

/**
 * Create a new academic session.
 *
 * Business rules:
 *  - name must be unique (DB constraint will catch duplicates).
 *  - endDate must be after startDate.
 *  - If isCurrent is true, all other sessions are set to isCurrent = false
 *    inside a transaction to maintain the single-current invariant.
 */
export async function createAcademicSession(
  input: CreateSessionInput
): Promise<AcademicSession> {
  if (input.endDate <= input.startDate) {
    throw new ClassesServiceError(
      "End date must be after start date",
      422
    );
  }

  return db.transaction(async (tx) => {
    // If this session is being set as current, clear the flag on all others.
    if (input.isCurrent) {
      await tx
        .update(academicSessions)
        .set({ isCurrent: false, updatedAt: sql`CURRENT_TIMESTAMP::text` })
        .where(eq(academicSessions.isCurrent, true));
    }

    const [inserted] = await tx
      .insert(academicSessions)
      .values({
        name: input.name.trim(),
        startDate: input.startDate,
        endDate: input.endDate,
        isCurrent: input.isCurrent ?? false,
      })
      .returning();

    return inserted;
  });
}

/**
 * Update an existing academic session.
 *
 * Partial updates are supported. If isCurrent is set to true the single-
 * current invariant is maintained transactionally.
 */
export async function updateAcademicSession(
  id: number,
  input: UpdateSessionInput
): Promise<AcademicSession> {
  // Validate dates if both are being updated
  const existing = await getAcademicSession(id);

  const newStart = input.startDate ?? existing.startDate;
  const newEnd = input.endDate ?? existing.endDate;
  if (newEnd <= newStart) {
    throw new ClassesServiceError("End date must be after start date", 422);
  }

  return db.transaction(async (tx) => {
    if (input.isCurrent === true) {
      // Clear current flag on all other sessions
      await tx
        .update(academicSessions)
        .set({ isCurrent: false, updatedAt: sql`CURRENT_TIMESTAMP::text` })
        .where(
          and(
            eq(academicSessions.isCurrent, true),
            ne(academicSessions.id, id)
          )
        );
    }

    const patch: Partial<InsertAcademicSession> & { updatedAt: string } = {
      updatedAt: new Date().toISOString(),
    };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.startDate !== undefined) patch.startDate = input.startDate;
    if (input.endDate !== undefined) patch.endDate = input.endDate;
    if (input.isCurrent !== undefined) patch.isCurrent = input.isCurrent;

    const [updated] = await tx
      .update(academicSessions)
      .set(patch)
      .where(eq(academicSessions.id, id))
      .returning();

    return updated;
  });
}

/**
 * Mark a session as the current one, clearing the flag from any other session.
 * Convenience wrapper around updateAcademicSession.
 */
export async function setCurrentAcademicSession(
  id: number
): Promise<AcademicSession> {
  return updateAcademicSession(id, { isCurrent: true });
}

/**
 * Delete an academic session.
 *
 * Business rule: the current session cannot be deleted while it is marked
 * current – the caller must first designate another session as current.
 */
export async function deleteAcademicSession(id: number): Promise<void> {
  const session = await getAcademicSession(id);
  if (session.isCurrent) {
    throw new ClassesServiceError(
      "Cannot delete the current academic session. Set another session as current first.",
      409
    );
  }

  await db.delete(academicSessions).where(eq(academicSessions.id, id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Student Promotion operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Promote a single student to a new class.
 *
 * Steps:
 *  1. Validate student exists and has role "student".
 *  2. Validate the target class exists and is active.
 *  3. Validate the target class has capacity.
 *  4. Determine the student's current class (fromClassId) from their className.
 *  5. Write a promotion_history record.
 *  6. Update users.class_name to the new class label.
 *  7. Decrement old class current_count / increment new class current_count.
 *
 * All steps run inside a single transaction.
 */
export async function promoteStudent(
  input: PromoteStudentInput
): Promise<PromotionHistory> {
  return db.transaction(async (tx) => {
    // ── 1. Validate student ──────────────────────────────────────────────────
    const [student] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.studentId), eq(users.role, "student")))
      .limit(1);

    if (!student) {
      throw new ClassesServiceError(
        `Student #${input.studentId} not found`,
        404
      );
    }

    // ── 2. Validate target class ─────────────────────────────────────────────
    const [toClass] = await tx
      .select()
      .from(classes)
      .where(eq(classes.id, input.toClassId))
      .limit(1);

    if (!toClass) {
      throw new ClassesServiceError(
        `Target class #${input.toClassId} not found`,
        404
      );
    }
    if (toClass.status !== "active") {
      throw new ClassesServiceError(
        `Target class "${classLabel(toClass)}" is not active`,
        422
      );
    }

    // ── 3. Capacity check ────────────────────────────────────────────────────
    if (toClass.currentCount >= toClass.capacity) {
      throw new ClassesServiceError(
        `Target class "${classLabel(toClass)}" is at full capacity (${toClass.capacity})`,
        422
      );
    }

    // ── 4. Resolve fromClassId from student's current className ──────────────
    let fromClassId: number | null = null;
    if (student.className) {
      const [fromClass] = await tx
        .select({ id: classes.id })
        .from(classes)
        .where(
          sql`lower(regexp_replace(${classes.grade} || ' ' || ${classes.section}, '[^a-z0-9]', '', 'g'))
              = lower(regexp_replace(${student.className}, '[^a-z0-9]', '', 'g'))`
        )
        .limit(1);
      fromClassId = fromClass?.id ?? null;
    }

    // Guard: prevent promoting to the same class
    if (fromClassId !== null && fromClassId === input.toClassId) {
      throw new ClassesServiceError(
        `Student is already in class "${classLabel(toClass)}"`,
        409
      );
    }

    // ── 5. Write promotion history ───────────────────────────────────────────
    const [historyRow] = await tx
      .insert(promotionHistory)
      .values({
        studentId: input.studentId,
        fromClassId,
        toClassId: input.toClassId,
        academicSessionId: input.academicSessionId ?? null,
        promotedBy: input.promotedBy,
        notes: input.notes ?? null,
        promotionDate: input.promotionDate ?? new Date().toISOString().slice(0, 10),
      })
      .returning();

    // ── 6. Update student's className ────────────────────────────────────────
    await tx
      .update(users)
      .set({ className: classLabel(toClass) })
      .where(eq(users.id, input.studentId));

    // ── 7. Update class counts ───────────────────────────────────────────────
    if (fromClassId !== null) {
      await tx
        .update(classes)
        .set({ currentCount: sql`GREATEST(${classes.currentCount} - 1, 0)` })
        .where(eq(classes.id, fromClassId));
    }
    await tx
      .update(classes)
      .set({ currentCount: sql`${classes.currentCount} + 1` })
      .where(eq(classes.id, input.toClassId));

    return historyRow;
  });
}

/**
 * Bulk-promote all active students in a source class to a target class.
 *
 * Returns an array of promotion history records (one per promoted student)
 * and a summary of any students that were skipped (e.g. target class full).
 */
export async function bulkPromoteClass(input: BulkPromoteInput): Promise<{
  promoted: PromotionHistory[];
  skipped: Array<{ studentId: number; name: string; reason: string }>;
}> {
  // Validate source and target classes exist
  const [fromClass] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, input.fromClassId))
    .limit(1);

  if (!fromClass) {
    throw new ClassesServiceError(
      `Source class #${input.fromClassId} not found`,
      404
    );
  }

  const [toClass] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, input.toClassId))
    .limit(1);

  if (!toClass) {
    throw new ClassesServiceError(
      `Target class #${input.toClassId} not found`,
      404
    );
  }

  if (input.fromClassId === input.toClassId) {
    throw new ClassesServiceError(
      "Source and target classes must be different",
      422
    );
  }

  // Find all active students currently in the source class
  const fromLabel = classLabel(fromClass);
  const studentsInClass = await db
    .select({ id: users.id, name: users.name, className: users.className })
    .from(users)
    .where(
      and(
        eq(users.role, "student"),
        sql`lower(regexp_replace(${users.className}, '[^a-z0-9]', '', 'g'))
            = lower(regexp_replace(${fromLabel}, '[^a-z0-9]', '', 'g'))`
      )
    );

  const promoted: PromotionHistory[] = [];
  const skipped: Array<{ studentId: number; name: string; reason: string }> = [];

  for (const student of studentsInClass) {
    try {
      const record = await promoteStudent({
        studentId: student.id,
        toClassId: input.toClassId,
        academicSessionId: input.academicSessionId,
        promotedBy: input.promotedBy,
        notes: input.notes,
      });
      promoted.push(record);
    } catch (err) {
      const reason =
        err instanceof ClassesServiceError
          ? err.message
          : "Unexpected error during promotion";
      skipped.push({ studentId: student.id, name: student.name ?? "", reason });
    }
  }

  return { promoted, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Promotion History queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the full promotion history for a specific student, newest first.
 */
export async function getStudentPromotionHistory(
  studentId: number
): Promise<PromotionHistoryRecord[]> {
  const rows = await db
    .select({
      history: promotionHistory,
      student: {
        id: users.id,
        name: users.name,
        className: users.className,
      },
    })
    .from(promotionHistory)
    .leftJoin(users, eq(promotionHistory.studentId, users.id))
    .where(eq(promotionHistory.studentId, studentId))
    .orderBy(desc(promotionHistory.createdAt));

  // Enrich with class and session data in a second pass to keep the query
  // readable and avoid a 5-way join.
  return enrichPromotionRows(rows);
}

/**
 * Get all promotions that targeted a specific class, newest first.
 * Useful for reviewing who was moved into a class during a session.
 */
export async function getClassPromotionHistory(
  classId: number
): Promise<PromotionHistoryRecord[]> {
  const rows = await db
    .select({
      history: promotionHistory,
      student: {
        id: users.id,
        name: users.name,
        className: users.className,
      },
    })
    .from(promotionHistory)
    .leftJoin(users, eq(promotionHistory.studentId, users.id))
    .where(eq(promotionHistory.toClassId, classId))
    .orderBy(desc(promotionHistory.createdAt));

  return enrichPromotionRows(rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type RawPromotionRow = {
  history: PromotionHistory;
  student: Pick<User, "id" | "name" | "className"> | null;
};

/**
 * Enriches raw promotion rows with class and session details.
 * Batches the class and session lookups to avoid N+1 queries.
 * Exported so the route layer can enrich single-row responses.
 */
export async function enrichPromotionRows(
  rows: RawPromotionRow[]
): Promise<PromotionHistoryRecord[]> {
  if (rows.length === 0) return [];

  // Collect unique IDs to batch-fetch
  const classIds = new Set<number>();
  const sessionIds = new Set<number>();
  const promoterIds = new Set<number>();
  const missingStudentIds = new Set<number>();

  for (const { history, student } of rows) {
    if (history.fromClassId) classIds.add(history.fromClassId);
    classIds.add(history.toClassId);
    if (history.academicSessionId) sessionIds.add(history.academicSessionId);
    if (history.promotedBy) promoterIds.add(history.promotedBy);
    // If student was not pre-joined, batch-fetch it
    if (!student) missingStudentIds.add(history.studentId);
  }

  // Batch fetch classes
  const classIdsArr = Array.from(classIds);
  const classRows = classIdsArr.length
    ? await db
        .select()
        .from(classes)
        .where(inArray(classes.id, classIdsArr))
    : [];

  // Batch fetch sessions
  const sessionIdsArr = Array.from(sessionIds);
  const sessionRows = sessionIdsArr.length
    ? await db
        .select()
        .from(academicSessions)
        .where(inArray(academicSessions.id, sessionIdsArr))
    : [];

  // Batch fetch promoter users
  const promoterIdsArr = Array.from(promoterIds);
  const promoterRows = promoterIdsArr.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, promoterIdsArr))
    : [];

  // Batch fetch missing students (when student was not pre-joined)
  const missingStudentIdsArr = Array.from(missingStudentIds);
  const studentRows = missingStudentIdsArr.length
    ? await db
        .select({ id: users.id, name: users.name, className: users.className })
        .from(users)
        .where(inArray(users.id, missingStudentIdsArr))
    : [];

  const classById = new Map(classRows.map((c) => [c.id, c]));
  const sessionById = new Map(sessionRows.map((s) => [s.id, s]));
  const promoterById = new Map(promoterRows.map((u) => [u.id, u]));
  const studentById = new Map(studentRows.map((u) => [u.id, u]));

  return rows.map(({ history, student }) => ({
    ...history,
    student: student ?? studentById.get(history.studentId) ?? null,
    fromClass: history.fromClassId ? (classById.get(history.fromClassId) ?? null) : null,
    toClass: classById.get(history.toClassId) ?? null,
    session: history.academicSessionId
      ? (sessionById.get(history.academicSessionId) ?? null)
      : null,
    promotedByUser: history.promotedBy
      ? (promoterById.get(history.promotedBy) ?? null)
      : null,
  }));
}
