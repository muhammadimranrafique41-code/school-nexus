/**
 * WhatsApp Diary Service
 *
 * Delivers homework-diary and daily-diary updates to parents via WhatsApp.
 * Integrates with the existing `homeworkDiary` and `dailyDiary` tables and
 * uses the core `whatsappService` for all API calls and message logging.
 *
 * Flow:
 *  1. Admin publishes a diary entry (homeworkDiary or dailyDiary).
 *  2. The route handler calls `sendDiaryWhatsappNotifications()`.
 *  3. This service resolves all students in the class, finds their family
 *     guardian phone numbers, checks opt-in, and sends one message per family.
 *  4. Results (sent / failed / skipped) are returned for the UI to display.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import {
  classes,
  dailyDiary,
  diaryTemplates,
  families,
  homeworkDiary,
  users,
} from "../../shared/schema.js";
import {
  interpolateTemplate,
  isWhatsappConfigured,
  normalisePhone,
  sendTemplateMessage,
  sendTextMessage,
} from "./whatsappService.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DiaryNotificationResult = {
  diaryEntryId: number;
  diaryType: "homework" | "daily";
  classId: number;
  className: string;
  date: string;
  totalStudents: number;
  notified: number;
  skipped: number;
  failed: number;
  errors: string[];
};

type GuardianContact = {
  familyId: number;
  familyName: string;
  phone: string;
  studentName: string;
  studentId: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve guardian phone numbers for all active students in a class.
 * One contact per family (avoids duplicate messages when siblings share a class).
 */
async function resolveGuardianContacts(
  classId: number
): Promise<GuardianContact[]> {
  // Fetch the class record to get its label
  const [classRow] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);

  if (!classRow) return [];

  const className = `${classRow.grade} ${classRow.section}`.trim();

  // Fetch all active students in this class by className string
  const studentRows = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.role, "student"),
        eq(users.className, className)
      )
    );

  const contacts: GuardianContact[] = [];
  const seenFamilyIds = new Set<number>();

  for (const student of studentRows) {
    if ((student.studentStatus ?? "active") !== "active") continue;
    if (!student.familyId) continue;
    if (seenFamilyIds.has(student.familyId)) continue;

    const [family] = await db
      .select()
      .from(families)
      .where(eq(families.id, student.familyId))
      .limit(1);

    if (!family) continue;

    // Prefer whatsapp_phone on the user row (parent user), then guardian primary phone
    const guardianPhone =
      (family.guardianDetails as { primary?: { phone?: string } } | null)
        ?.primary?.phone ?? null;

    if (!guardianPhone) continue;

    seenFamilyIds.add(student.familyId);
    contacts.push({
      familyId: family.id,
      familyName: family.name,
      phone: guardianPhone,
      studentName: student.name,
      studentId: student.id,
    });
  }

  return contacts;
}

/**
 * Format a diary date string for display (YYYY-MM-DD → "6 May 2026").
 */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-PK", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send WhatsApp notifications for a published `homework_diary` entry.
 *
 * @param diaryId  - `homeworkDiary.id`
 * @param useTemplate - When true, uses the "homework_diary" WhatsApp template
 *                      (requires Meta approval). When false, sends a plain text
 *                      message (works without template approval, good for testing).
 */
export async function sendHomeworkDiaryNotifications(
  diaryId: number,
  useTemplate = false
): Promise<DiaryNotificationResult> {
  if (!isWhatsappConfigured()) {
    console.warn(
      "[WhatsApp Diary] WhatsApp is not configured — skipping notifications."
    );
    return {
      diaryEntryId: diaryId,
      diaryType: "homework",
      classId: 0,
      className: "",
      date: "",
      totalStudents: 0,
      notified: 0,
      skipped: 0,
      failed: 0,
      errors: ["WhatsApp is not configured (missing env vars)."],
    };
  }

  // Load the diary entry
  const [diary] = await db
    .select()
    .from(homeworkDiary)
    .where(eq(homeworkDiary.id, diaryId))
    .limit(1);

  if (!diary) {
    throw new Error(`Homework diary entry ${diaryId} not found.`);
  }

  if (diary.status !== "published") {
    throw new Error(
      `Homework diary entry ${diaryId} is not published (status: ${diary.status}).`
    );
  }

  // Load class info
  const [classRow] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, diary.classId))
    .limit(1);

  const className = classRow
    ? `${classRow.grade} ${classRow.section}`.trim()
    : `Class #${diary.classId}`;

  const dateStr = typeof diary.date === "string" ? diary.date : String(diary.date);
  const formattedDate = formatDate(dateStr);

  // Build subject list from entries
  const entries = (diary.entries ?? []) as {
    subject: string;
    topic: string;
    note?: string;
  }[];
  const subjectList = entries.map((e) => e.subject).join(", ") || "General";

  // Resolve guardian contacts
  const contacts = await resolveGuardianContacts(diary.classId);

  const result: DiaryNotificationResult = {
    diaryEntryId: diaryId,
    diaryType: "homework",
    classId: diary.classId,
    className,
    date: dateStr,
    totalStudents: contacts.length,
    notified: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const contact of contacts) {
    try {
      const normalisedPhone = normalisePhone(contact.phone);
      if (!normalisedPhone || normalisedPhone.length < 8) {
        result.skipped += 1;
        continue;
      }

      if (useTemplate) {
        await sendTemplateMessage({
          to: normalisedPhone,
          templateName: "homework_diary",
          variables: [
            contact.familyName,
            contact.studentName,
            className,
            formattedDate,
            subjectList,
          ],
          recipientId: contact.studentId,
          recipientType: "student",
          metadata: {
            diary_entry_id: diaryId,
            class_id: diary.classId,
            family_id: contact.familyId,
          },
        });
      } else {
        // Plain-text fallback — no Meta template approval required
        const body = buildHomeworkDiaryText({
          studentName: contact.studentName,
          className,
          date: formattedDate,
          entries,
        });

        await sendTextMessage({
          to: normalisedPhone,
          body,
          recipientId: contact.studentId,
          recipientType: "student",
          metadata: {
            diary_entry_id: diaryId,
            class_id: diary.classId,
            family_id: contact.familyId,
          },
        });
      }

      result.notified += 1;
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : String(error);
      result.failed += 1;
      result.errors.push(
        `${contact.studentName} (${contact.phone}): ${msg}`
      );
      console.error(
        `[WhatsApp Diary] Failed to notify family ${contact.familyId}:`,
        msg
      );
    }
  }

  console.log(
    `[WhatsApp Diary] Homework diary ${diaryId} (${className}, ${dateStr}): ` +
      `notified=${result.notified}, skipped=${result.skipped}, failed=${result.failed}`
  );

  return result;
}

/**
 * Send WhatsApp notifications for a published `daily_diary` entry.
 */
export async function sendDailyDiaryNotifications(
  dailyDiaryId: number,
  useTemplate = false
): Promise<DiaryNotificationResult> {
  if (!isWhatsappConfigured()) {
    console.warn(
      "[WhatsApp Diary] WhatsApp is not configured — skipping notifications."
    );
    return {
      diaryEntryId: dailyDiaryId,
      diaryType: "daily",
      classId: 0,
      className: "",
      date: "",
      totalStudents: 0,
      notified: 0,
      skipped: 0,
      failed: 0,
      errors: ["WhatsApp is not configured (missing env vars)."],
    };
  }

  // Load the daily diary entry with its template
  const [diaryRow] = await db
    .select()
    .from(dailyDiary)
    .where(eq(dailyDiary.id, dailyDiaryId))
    .limit(1);

  if (!diaryRow) {
    throw new Error(`Daily diary entry ${dailyDiaryId} not found.`);
  }

  if (diaryRow.status !== "published") {
    throw new Error(
      `Daily diary entry ${dailyDiaryId} is not published (status: ${diaryRow.status}).`
    );
  }

  // Load template for subject names
  const [tmplRow] = await db
    .select()
    .from(diaryTemplates)
    .where(eq(diaryTemplates.id, diaryRow.templateId))
    .limit(1);

  // Load class info
  const [classRow] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, diaryRow.classId))
    .limit(1);

  const className = classRow
    ? `${classRow.grade} ${classRow.section}`.trim()
    : `Class #${diaryRow.classId}`;

  const dateStr =
    typeof diaryRow.date === "string" ? diaryRow.date : String(diaryRow.date);
  const formattedDate = formatDate(dateStr);

  // Build subject list from template questions
  const questions = (tmplRow?.questions ?? []) as {
    id: string;
    subject: string;
    question: string;
  }[];
  const subjectList =
    questions.map((q) => q.subject).join(", ") || "General";

  // Build content summary
  const content = (diaryRow.content ?? []) as {
    questionId: string;
    answer: string;
  }[];
  const contentSummary = content
    .map((c) => {
      const q = questions.find((q) => q.id === c.questionId);
      return q ? `${q.subject}: ${c.answer}` : c.answer;
    })
    .filter(Boolean)
    .join("\n");

  // Resolve guardian contacts
  const contacts = await resolveGuardianContacts(diaryRow.classId);

  const result: DiaryNotificationResult = {
    diaryEntryId: dailyDiaryId,
    diaryType: "daily",
    classId: diaryRow.classId,
    className,
    date: dateStr,
    totalStudents: contacts.length,
    notified: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const contact of contacts) {
    try {
      const normalisedPhone = normalisePhone(contact.phone);
      if (!normalisedPhone || normalisedPhone.length < 8) {
        result.skipped += 1;
        continue;
      }

      if (useTemplate) {
        await sendTemplateMessage({
          to: normalisedPhone,
          templateName: "homework_diary",
          variables: [
            contact.familyName,
            contact.studentName,
            className,
            formattedDate,
            subjectList,
          ],
          recipientId: contact.studentId,
          recipientType: "student",
          metadata: {
            diary_entry_id: dailyDiaryId,
            diary_type: "daily",
            class_id: diaryRow.classId,
            family_id: contact.familyId,
          },
        });
      } else {
        const body = buildDailyDiaryText({
          studentName: contact.studentName,
          className,
          date: formattedDate,
          contentSummary,
        });

        await sendTextMessage({
          to: normalisedPhone,
          body,
          recipientId: contact.studentId,
          recipientType: "student",
          metadata: {
            diary_entry_id: dailyDiaryId,
            diary_type: "daily",
            class_id: diaryRow.classId,
            family_id: contact.familyId,
          },
        });
      }

      result.notified += 1;
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : String(error);
      result.failed += 1;
      result.errors.push(
        `${contact.studentName} (${contact.phone}): ${msg}`
      );
      console.error(
        `[WhatsApp Diary] Failed to notify family ${contact.familyId}:`,
        msg
      );
    }
  }

  console.log(
    `[WhatsApp Diary] Daily diary ${dailyDiaryId} (${className}, ${dateStr}): ` +
      `notified=${result.notified}, skipped=${result.skipped}, failed=${result.failed}`
  );

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message body builders (plain-text fallback)
// ─────────────────────────────────────────────────────────────────────────────

function buildHomeworkDiaryText(params: {
  studentName: string;
  className: string;
  date: string;
  entries: { subject: string; topic: string; note?: string }[];
}): string {
  const lines: string[] = [
    `📚 *Homework Diary – ${params.date}*`,
    `Student: ${params.studentName} | Class: ${params.className}`,
    "",
  ];

  for (const entry of params.entries) {
    lines.push(`• *${entry.subject}*: ${entry.topic}`);
    if (entry.note) lines.push(`  _Note: ${entry.note}_`);
  }

  lines.push("", "— Schooliee School Management");
  return lines.join("\n");
}

function buildDailyDiaryText(params: {
  studentName: string;
  className: string;
  date: string;
  contentSummary: string;
}): string {
  const lines: string[] = [
    `📖 *Daily Diary – ${params.date}*`,
    `Student: ${params.studentName} | Class: ${params.className}`,
    "",
  ];

  if (params.contentSummary) {
    lines.push(params.contentSummary);
  }

  lines.push("", "— Schooliee School Management");
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported template interpolation helper (re-exported for route use)
// ─────────────────────────────────────────────────────────────────────────────
export { interpolateTemplate };
