import { and, count, desc, eq, inArray, sql, sum } from "drizzle-orm";
import {
  academics,
  attendance,
  feePayments,
  fees,
  qrAttendanceEvents,
  qrProfiles,
  results,
  schoolSettings,
  schoolSettingsAuditLogs,
  schoolSettingsVersions,
  students,
  studentBillingProfiles,
  teachers,
  timetable,
  type Academic,
  type AcademicWithTeacher,
  type Attendance,
  type AttendanceWithStudent,
  type Fee,
  type FeePaymentWithMeta,
  type FeeWithStudent,
  type InsertAcademic,
  type InsertAttendance,
  type InsertQrAttendanceEvent,
  type InsertQrProfile,
  type InsertResult,
  type InsertTimetable,
  type InsertUser,
  type QrAttendanceEvent,
  type QrAttendanceEventWithUser,
  type QrProfile,
  type QrProfileWithUser,
  type Result,
  type ResultWithStudent,
  type SchoolSettings,
  type SchoolSettingsAuditLog,
  type SchoolSettingsVersion,
  type StudentBillingProfile,
  type StudentBillingProfileWithStudent,
  type Timetable,
  type TimetableWithDetails,
  type User,
  users,
} from "../shared/schema.js";
import {
  buildFeeBalanceSummary,
  buildFinanceReportSnapshot,
  buildOverdueBalanceEntries,
  buildStudentBalanceSummary,
  buildDocumentNumber,
  buildDueDateForBillingMonth,
  formatBillingPeriod,
  normalizeFeeLineItems,
  summarizeFeeLedger,
  toIsoDate,
  type BillingProfileInput,
  type CreateFeeInput,
  type FeeBalanceSummary,
  type FinanceReportSnapshot,
  type FeeStatus,
  type GenerateMonthlyFeesInput,
  type OverdueBalanceEntry,
  type RecordFeePaymentInput,
  type StudentBalanceSummary,
  type UpdateFeeInput,
} from "../shared/finance.js";
import type { AdminSchoolSettingsResponse, PublicSchoolSettings, SchoolSettingsAuditAction, SchoolSettingsData } from "../shared/settings.js";
import { schoolSettingsDataSchema } from "../shared/settings.js";
import { db } from "./db.js";
import { decryptQrToken, encryptQrToken, generateQrPublicId, generateQrToken, getAttendanceDate, hashQrToken } from "./qr-service.js";
import {
  buildPublicSchoolSettings,
  buildSchoolSettingsCompletion,
  decryptSchoolSettingsData,
  diffSchoolSettings,
  encryptSchoolSettingsData,
  getSafeSchoolSettingsDefaults,
} from "./settings-service.js";

const generatedDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;
const generatedSlots = [
  { periodLabel: "Period 1", startTime: "08:00", endTime: "08:50" },
  { periodLabel: "Period 2", startTime: "09:00", endTime: "09:50" },
  { periodLabel: "Period 3", startTime: "10:10", endTime: "11:00" },
  { periodLabel: "Period 4", startTime: "11:10", endTime: "12:00" },
  { periodLabel: "Period 5", startTime: "13:00", endTime: "13:50" },
] as const;

type RuntimeSettingsState = {
  current: SchoolSettings;
  versions: SchoolSettingsVersion[];
  auditLogs: SchoolSettingsAuditLog[];
  nextVersionId: number;
  nextAuditId: number;
};

type FinanceReportFilters = {
  month?: string;
  studentId?: number;
  status?: FeeStatus;
};

const createRuntimeSettingsState = (): RuntimeSettingsState => {
  const timestamp = new Date().toISOString();
  return {
    current: {
      id: 1,
      version: 1,
      data: encryptSchoolSettingsData(getSafeSchoolSettingsDefaults()),
      createdAt: timestamp,
      updatedAt: timestamp,
      updatedBy: null,
    },
    versions: [],
    auditLogs: [],
    nextVersionId: 1,
    nextAuditId: 1,
  };
};

const runtimeSettingsState = createRuntimeSettingsState();

const isMissingSettingsTableError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  ["42P01", "42703"].includes(String((error as { code?: string }).code));

const isMissingQrAttendanceTableError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  String((error as { code?: string }).code) === "42P01";

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  String((error as { code?: string }).code) === "23505";

const toUserSummary = (user?: User) =>
  user
    ? {
      id: user.id,
      name: user.name,
      email: user.email,
    }
    : undefined;

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  getUsers(): Promise<User[]>;
  getStudents(): Promise<User[]>;
  getTeachers(): Promise<User[]>;

  getAcademics(): Promise<AcademicWithTeacher[]>;
  createAcademic(record: InsertAcademic): Promise<Academic>;
  updateAcademic(id: number, updates: Partial<InsertAcademic>): Promise<Academic | undefined>;
  deleteAcademic(id: number): Promise<boolean>;

  getAttendance(): Promise<AttendanceWithStudent[]>;
  getAttendanceByStudent(studentId: number): Promise<AttendanceWithStudent[]>;
  getAttendanceByTeacher(teacherId: number): Promise<AttendanceWithStudent[]>;
  getAttendanceRecord(id: number): Promise<AttendanceWithStudent | undefined>;
  createAttendance(record: InsertAttendance): Promise<Attendance>;
  upsertAttendanceRecords(records: InsertAttendance[]): Promise<AttendanceWithStudent[]>;
  updateAttendance(id: number, updates: Partial<InsertAttendance>): Promise<AttendanceWithStudent | undefined>;
  getTeacherClasses(teacherId: number): Promise<{ className: string; studentCount: number; subjects: string[] }[]>;
  getStudentsByClass(className: string): Promise<User[]>;
  getQrProfiles(): Promise<QrProfileWithUser[]>;
  getQrProfile(userId: number): Promise<QrProfileWithUser | undefined>;
  issueQrProfile(userId: number, generatedBy?: number): Promise<{ profile: QrProfileWithUser; token: string; created: boolean }>;
  regenerateQrProfile(userId: number, generatedBy?: number): Promise<{ profile: QrProfileWithUser; token: string }>;
  setQrProfileActive(userId: number, isActive: boolean): Promise<QrProfileWithUser | undefined>;
  getQrAttendanceEvents(filters?: {
    userId?: number;
    role?: "student" | "teacher";
    attendanceDate?: string;
    scannedBy?: number;
  }): Promise<QrAttendanceEventWithUser[]>;
  getMyQrCard(userId: number): Promise<{
    profile: QrProfileWithUser;
    token: string;
    recentEvents: QrAttendanceEventWithUser[];
  } | undefined>;
  scanQrAttendance(input: {
    token: string;
    scannedBy: number;
    direction: "Check In" | "Check Out";
    status?: "Present" | "Late";
    scanMethod: "camera" | "manual";
    terminalLabel?: string | null;
    notes?: string | null;
  }): Promise<{
    event: QrAttendanceEventWithUser;
    duplicate: boolean;
    attendanceRecord?: AttendanceWithStudent;
  } | undefined>;

  getResult(id: number): Promise<Result | undefined>;
  getResults(): Promise<ResultWithStudent[]>;
  getResultsByStudent(studentId: number): Promise<ResultWithStudent[]>;
  createResult(record: InsertResult): Promise<Result>;
  updateResult(id: number, updates: Partial<InsertResult>): Promise<Result | undefined>;
  deleteResult(id: number): Promise<boolean>;

  getTimetableByClass(className: string): Promise<TimetableWithDetails[]>;
  createTimetableItem(record: InsertTimetable): Promise<Timetable>;

  getFees(): Promise<FeeWithStudent[]>;
  getFeesByStudent(studentId: number): Promise<FeeWithStudent[]>;
  getFee(id: number): Promise<FeeWithStudent | undefined>;
  getFeePayments(filters?: { month?: string; studentId?: number; method?: RecordFeePaymentInput["method"] }): Promise<FeePaymentWithMeta[]>;
  getPaymentReceipt(paymentId: number): Promise<{ invoice: FeeWithStudent; payment: FeePaymentWithMeta } | undefined>;
  createFee(record: CreateFeeInput): Promise<FeeWithStudent>;
  updateFee(id: number, updates: UpdateFeeInput): Promise<FeeWithStudent | undefined>;
  deleteFee(id: number): Promise<boolean>;
  recordFeePayment(id: number, payment: RecordFeePaymentInput, createdBy?: number): Promise<FeeWithStudent | undefined>;
  getBillingProfiles(): Promise<StudentBillingProfileWithStudent[]>;
  upsertBillingProfile(input: BillingProfileInput): Promise<StudentBillingProfileWithStudent>;
  generateMonthlyFees(input: GenerateMonthlyFeesInput): Promise<{
    billingMonth: string;
    generatedCount: number;
    skippedDuplicates: number;
    skippedMissingProfiles: number;
    invoices: FeeWithStudent[];
    skippedStudents: { studentId: number; studentName: string; reason: string }[];
  }>;
  getFinanceReport(filters?: FinanceReportFilters): Promise<FinanceReportSnapshot>;
  getFeeBalanceSummary(): Promise<FeeBalanceSummary>;
  getStudentBalance(studentId: number): Promise<StudentBalanceSummary>;
  getOverdueBalances(): Promise<OverdueBalanceEntry[]>;

  getTotalStudents(): Promise<number>;
  getTotalTeachers(): Promise<number>;
  getFeesCollected(): Promise<number>;
  getActiveClassesCount(): Promise<number>;
  getSchoolSettings(): Promise<AdminSchoolSettingsResponse>;
  getPublicSchoolSettings(): Promise<PublicSchoolSettings>;
  updateSchoolSettings(data: SchoolSettingsData, updatedBy?: number, changeSummary?: string): Promise<AdminSchoolSettingsResponse>;
  importSchoolSettings(data: SchoolSettingsData, updatedBy?: number, changeSummary?: string): Promise<AdminSchoolSettingsResponse>;
  restoreSchoolSettings(version: number, updatedBy?: number, changeSummary?: string): Promise<AdminSchoolSettingsResponse | undefined>;
  exportSchoolSettings(): Promise<{ exportedAt: string; version: number; data: SchoolSettingsData }>;
  getAdminDashboardStats(): Promise<{
    totalStudents: number;
    totalTeachers: number;
    feesCollected: number;
    activeClasses: number;
    outstandingFees: number;
    pendingPayments: number;
    overdueInvoices: number;
    attendanceMarkedToday: number;
    monthlyRevenue: { month: string; revenue: number }[];
    recentActivity: {
      id: string;
      type: "fee" | "attendance";
      title: string;
      description: string;
      dateLabel: string;
    }[];
  }>;
  getStudentDashboardStats(studentId: number): Promise<{
    attendanceRate: number;
    unpaidFees: number;
    openInvoices: number;
    overdueInvoices: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  private normalizeAttendance(record: InsertAttendance): InsertAttendance & { session: string; remarks: string | null } {
    return {
      ...record,
      session: record.session ?? "Full Day",
      remarks: record.remarks ?? null,
    };
  }

  private normalizeResult(record: InsertResult): InsertResult {
    return {
      ...record,
      totalMarks: record.totalMarks ?? 100,
      examTitle: record.examTitle ?? "General Assessment",
      examType: record.examType ?? "Exam",
      term: record.term ?? "Term 1",
      examDate: record.examDate ?? new Date().toISOString().slice(0, 10),
      remarks: record.remarks ?? null,
    };
  }

  private async getUsersMap() {
    const allUsers = await db.select().from(users);
    return new Map(allUsers.map((user) => [user.id, user]));
  }

  private async ensureSchoolSettingsRecord(executor: any = db): Promise<SchoolSettings> {
    const [existingRecord] = await executor.select().from(schoolSettings).limit(1);
    if (existingRecord) return existingRecord;

    const timestamp = new Date().toISOString();
    const [createdRecord] = await executor
      .insert(schoolSettings)
      .values({
        version: 1,
        data: encryptSchoolSettingsData(getSafeSchoolSettingsDefaults()),
        createdAt: timestamp,
        updatedAt: timestamp,
        updatedBy: null,
      })
      .returning();
    return createdRecord;
  }

  private async buildSchoolSettingsResponse(
    record: SchoolSettings,
    versionRows: SchoolSettingsVersion[],
    auditRows: SchoolSettingsAuditLog[],
  ): Promise<AdminSchoolSettingsResponse> {
    const [userMap, data] = await Promise.all([this.getUsersMap(), Promise.resolve(decryptSchoolSettingsData(record.data))]);
    const completion = buildSchoolSettingsCompletion(data);

    return {
      settings: {
        id: record.id,
        version: record.version,
        data,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        updatedBy: record.updatedBy ? toUserSummary(userMap.get(record.updatedBy)) : undefined,
        completionChecklist: completion.checklist,
        completionPercentage: completion.completionPercentage,
        isSetupComplete: completion.isComplete,
      },
      publicSettings: buildPublicSchoolSettings(data),
      versions: versionRows.map((version) => ({
        id: version.id,
        version: version.version,
        changeSummary: version.changeSummary,
        createdAt: version.createdAt,
        createdBy: version.createdBy ? toUserSummary(userMap.get(version.createdBy)) : undefined,
      })),
      auditLog: auditRows.map((entry) => ({
        id: entry.id,
        action: entry.action,
        category: entry.category as any,
        fieldPath: entry.fieldPath ?? undefined,
        previousValue: entry.previousValue,
        nextValue: entry.nextValue,
        changeSummary: entry.changeSummary,
        createdAt: entry.createdAt,
        createdBy: entry.createdBy ? toUserSummary(userMap.get(entry.createdBy)) : undefined,
      })),
    };
  }

  private async buildFallbackSchoolSettingsResponse(): Promise<AdminSchoolSettingsResponse> {
    return this.buildSchoolSettingsResponse(runtimeSettingsState.current, runtimeSettingsState.versions, runtimeSettingsState.auditLogs);
  }

  private async applySettingsMutation(
    nextInput: SchoolSettingsData,
    action: SchoolSettingsAuditAction,
    updatedBy?: number,
    changeSummary?: string,
  ): Promise<AdminSchoolSettingsResponse> {
    const nextData = schoolSettingsDataSchema.parse(nextInput);

    try {
      await db.transaction(async (tx) => {
        const currentRecord = await this.ensureSchoolSettingsRecord(tx);
        const previousData = decryptSchoolSettingsData(currentRecord.data);
        const changes = diffSchoolSettings(previousData, nextData, action, changeSummary);
        if (changes.length === 0) return;

        const timestamp = new Date().toISOString();
        await tx.insert(schoolSettingsVersions).values({
          settingsId: currentRecord.id,
          version: currentRecord.version,
          data: currentRecord.data,
          changeSummary: changeSummary ?? `Settings ${action}d`,
          createdAt: timestamp,
          createdBy: updatedBy ?? null,
        });

        await tx
          .update(schoolSettings)
          .set({
            version: currentRecord.version + 1,
            data: encryptSchoolSettingsData(nextData),
            updatedAt: timestamp,
            updatedBy: updatedBy ?? null,
          })
          .where(eq(schoolSettings.id, currentRecord.id));

        await tx.insert(schoolSettingsAuditLogs).values(
          changes.map((change) => ({
            settingsId: currentRecord.id,
            action: change.action,
            category: change.category ?? null,
            fieldPath: change.fieldPath ?? null,
            previousValue: change.previousValue ?? null,
            nextValue: change.nextValue ?? null,
            changeSummary: change.changeSummary ?? null,
            createdAt: timestamp,
            createdBy: updatedBy ?? null,
          })),
        );
      });

      return this.getSchoolSettings();
    } catch (error) {
      if (!isMissingSettingsTableError(error)) throw error;

      const previousData = decryptSchoolSettingsData(runtimeSettingsState.current.data);
      const changes = diffSchoolSettings(previousData, nextData, action, changeSummary);
      if (changes.length > 0) {
        const timestamp = new Date().toISOString();
        runtimeSettingsState.versions.unshift({
          id: runtimeSettingsState.nextVersionId++,
          settingsId: runtimeSettingsState.current.id,
          version: runtimeSettingsState.current.version,
          data: runtimeSettingsState.current.data,
          changeSummary: changeSummary ?? `Settings ${action}d`,
          createdAt: timestamp,
          createdBy: updatedBy ?? null,
        });

        runtimeSettingsState.current = {
          ...runtimeSettingsState.current,
          version: runtimeSettingsState.current.version + 1,
          data: encryptSchoolSettingsData(nextData),
          updatedAt: timestamp,
          updatedBy: updatedBy ?? null,
        };

        runtimeSettingsState.auditLogs.unshift(
          ...changes.map((change) => ({
            id: runtimeSettingsState.nextAuditId++,
            settingsId: runtimeSettingsState.current.id,
            action: change.action,
            category: change.category ?? null,
            fieldPath: change.fieldPath ?? null,
            previousValue: change.previousValue ?? null,
            nextValue: change.nextValue ?? null,
            changeSummary: change.changeSummary ?? null,
            createdAt: timestamp,
            createdBy: updatedBy ?? null,
          })),
        );
      }

      return this.buildFallbackSchoolSettingsResponse();
    }
  }

  private async restoreFromVersion(version: number, updatedBy?: number, changeSummary?: string): Promise<AdminSchoolSettingsResponse | undefined> {
    try {
      const currentRecord = await this.ensureSchoolSettingsRecord();
      const [targetVersion] = await db
        .select()
        .from(schoolSettingsVersions)
        .where(and(eq(schoolSettingsVersions.settingsId, currentRecord.id), eq(schoolSettingsVersions.version, version)))
        .limit(1);

      if (!targetVersion) return undefined;
      return this.applySettingsMutation(
        decryptSchoolSettingsData(targetVersion.data),
        "restore",
        updatedBy,
        changeSummary ?? `Restored settings from version ${version}`,
      );
    } catch (error) {
      if (!isMissingSettingsTableError(error)) throw error;

      const targetVersion = runtimeSettingsState.versions.find((entry) => entry.version === version);
      if (!targetVersion) return undefined;
      return this.applySettingsMutation(
        decryptSchoolSettingsData(targetVersion.data),
        "restore",
        updatedBy,
        changeSummary ?? `Restored settings from version ${version}`,
      );
    }
  }

  private attachAttendanceUsers(records: Attendance[], userMap: Map<number, User>): AttendanceWithStudent[] {
    return records
      .map((record) => ({
        ...record,
        student: userMap.get(record.studentId),
        teacher: userMap.get(record.teacherId),
      }))
      .sort((left, right) => `${right.date}-${right.session}`.localeCompare(`${left.date}-${left.session}`));
  }

  private attachQrProfileUsers(records: QrProfile[], userMap: Map<number, User>): QrProfileWithUser[] {
    return records
      .map((record) => ({
        ...record,
        user: userMap.get(record.userId),
        generatedByUser: record.generatedBy ? userMap.get(record.generatedBy) : undefined,
        lastUsedByUser: record.lastUsedBy ? userMap.get(record.lastUsedBy) : undefined,
      }))
      .sort((left, right) => left.user?.name.localeCompare(right.user?.name ?? "") ?? 0);
  }

  private attachQrAttendanceUsers(records: QrAttendanceEvent[], userMap: Map<number, User>): QrAttendanceEventWithUser[] {
    return records
      .map((record) => ({
        ...record,
        user: userMap.get(record.userId),
        scannedByUser: userMap.get(record.scannedBy),
      }))
      .sort((left, right) => `${right.scannedAt}-${right.id}`.localeCompare(`${left.scannedAt}-${left.id}`));
  }

  private attachResultStudents(records: Result[], userMap: Map<number, User>): ResultWithStudent[] {
    return records
      .map((record) => ({
        ...record,
        student: userMap.get(record.studentId),
      }))
      .sort((left, right) => (right.examDate ?? right.id.toString()).localeCompare(left.examDate ?? left.id.toString()));
  }

  private buildGeneratedTimetable(className: string, records: AcademicWithTeacher[]): TimetableWithDetails[] {
    const classAcademics = records.filter((record) => record.className === className);
    const source = classAcademics.length > 0 ? classAcademics : records;

    if (source.length === 0) {
      return generatedDays.flatMap((dayOfWeek, dayIndex) =>
        generatedSlots.slice(0, 4).map((slot, slotIndex) => ({
          id: -(dayIndex * 4 + slotIndex + 1),
          academicId: null,
          className,
          dayOfWeek,
          periodLabel: slot.periodLabel,
          startTime: slot.startTime,
          endTime: slot.endTime,
          room: `Room ${101 + slotIndex}`,
          classType: "Study Hall",
          teacherId: null,
          sortOrder: slotIndex + 1,
        })) as TimetableWithDetails[],
      );
    }

    return generatedDays.flatMap((dayOfWeek, dayIndex) =>
      generatedSlots.map((slot, slotIndex) => {
        const academic = source[(dayIndex + slotIndex) % source.length];
        return {
          id: -(dayIndex * generatedSlots.length + slotIndex + 1),
          academicId: academic?.id ?? null,
          className,
          dayOfWeek,
          periodLabel: slot.periodLabel,
          startTime: slot.startTime,
          endTime: slot.endTime,
          room: academic ? `Room ${101 + slotIndex}` : "Main Hall",
          classType: slotIndex === generatedSlots.length - 1 ? "Tutorial" : "Lecture",
          teacherId: academic?.teacherUserId ?? null,
          sortOrder: slotIndex + 1,
          academic,
          teacher: academic?.teacher,
        };
      }),
    );
  }

  private async syncRoleProfiles(): Promise<void> {
    await db.execute(sql`
      delete from students
      using users
      where students.user_id = users.id
        and users.role <> 'student'
    `);

    await db.execute(sql`
      delete from teachers
      using users
      where teachers.user_id = users.id
        and users.role <> 'teacher'
    `);

    await db.execute(sql`
      insert into students (user_id, class_name)
      select id, coalesce(class_name, 'Unassigned')
      from users
      where role = 'student'
      on conflict (user_id) do update
      set class_name = excluded.class_name
    `);

    await db.execute(sql`
      insert into teachers (user_id, subject)
      select id, coalesce(subject, 'General')
      from users
      where role = 'teacher'
      on conflict (user_id) do update
      set subject = excluded.subject
    `);
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    return db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values(insertUser).returning();

      if (user.role === "student") {
        await tx
          .insert(students)
          .values({ userId: user.id, className: user.className ?? "Unassigned" })
          .onConflictDoUpdate({
            target: students.userId,
            set: { className: user.className ?? "Unassigned" },
          });
      }

      if (user.role === "teacher") {
        await tx
          .insert(teachers)
          .values({ userId: user.id, subject: user.subject ?? "General" })
          .onConflictDoUpdate({
            target: teachers.userId,
            set: { subject: user.subject ?? "General" },
          });
      }

      return user;
    });
  }

  async updateUser(id: number, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!user) return undefined;
    await this.syncRoleProfiles();
    return user;
  }

  async deleteUser(id: number): Promise<boolean> {
    const [deleted] = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
    return Boolean(deleted);
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getStudents(): Promise<User[]> {
    await this.syncRoleProfiles();
    const rows = await db.select({ user: users }).from(students).innerJoin(users, eq(students.userId, users.id));
    return rows.map(({ user }) => user);
  }

  async getTeachers(): Promise<User[]> {
    await this.syncRoleProfiles();
    const rows = await db.select({ user: users }).from(teachers).innerJoin(users, eq(teachers.userId, users.id));
    return rows.map(({ user }) => user);
  }

  async getAcademics(): Promise<AcademicWithTeacher[]> {
    await this.syncRoleProfiles();
    const records = await db.select().from(academics);
    const userMap = await this.getUsersMap();

    return records.map((record) => ({
      ...record,
      teacher: record.teacherUserId ? userMap.get(record.teacherUserId) : undefined,
    }));
  }

  async createAcademic(record: InsertAcademic): Promise<Academic> {
    const [newRecord] = await db.insert(academics).values(record).returning();
    return newRecord;
  }

  async updateAcademic(id: number, updates: Partial<InsertAcademic>): Promise<Academic | undefined> {
    const [updated] = await db.update(academics).set(updates).where(eq(academics.id, id)).returning();
    return updated;
  }

  async deleteAcademic(id: number): Promise<boolean> {
    const [deleted] = await db.delete(academics).where(eq(academics.id, id)).returning({ id: academics.id });
    return Boolean(deleted);
  }

  async getAttendance(): Promise<AttendanceWithStudent[]> {
    const [records, userMap] = await Promise.all([db.select().from(attendance), this.getUsersMap()]);
    return this.attachAttendanceUsers(records, userMap);
  }

  async getAttendanceByStudent(studentId: number): Promise<AttendanceWithStudent[]> {
    const [records, userMap] = await Promise.all([
      db.select().from(attendance).where(eq(attendance.studentId, studentId)),
      this.getUsersMap(),
    ]);
    return this.attachAttendanceUsers(records, userMap);
  }

  async getAttendanceByTeacher(teacherId: number): Promise<AttendanceWithStudent[]> {
    const [records, userMap] = await Promise.all([
      db.select().from(attendance).where(eq(attendance.teacherId, teacherId)),
      this.getUsersMap(),
    ]);
    return this.attachAttendanceUsers(records, userMap);
  }

  async getAttendanceRecord(id: number): Promise<AttendanceWithStudent | undefined> {
    const [record] = await db.select().from(attendance).where(eq(attendance.id, id));
    if (!record) return undefined;
    const userMap = await this.getUsersMap();
    return this.attachAttendanceUsers([record], userMap)[0];
  }

  async createAttendance(record: InsertAttendance): Promise<Attendance> {
    const payload = this.normalizeAttendance(record);
    const [existing] = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.studentId, payload.studentId),
          eq(attendance.date, payload.date),
          eq(attendance.session, payload.session),
        ),
      );

    if (existing) {
      const [updated] = await db
        .update(attendance)
        .set({ teacherId: payload.teacherId, status: payload.status, session: payload.session, remarks: payload.remarks })
        .where(eq(attendance.id, existing.id))
        .returning();
      return updated;
    }

    const [newRecord] = await db.insert(attendance).values(payload).returning();
    return newRecord;
  }

  async upsertAttendanceRecords(records: InsertAttendance[]): Promise<AttendanceWithStudent[]> {
    const saved: Attendance[] = [];

    await db.transaction(async (tx) => {
      for (const record of records) {
        const payload = this.normalizeAttendance(record);
        const [existing] = await tx
          .select()
          .from(attendance)
          .where(
            and(
              eq(attendance.studentId, payload.studentId),
              eq(attendance.date, payload.date),
              eq(attendance.session, payload.session),
            ),
          );

        if (existing) {
          const [updated] = await tx
            .update(attendance)
            .set({ teacherId: payload.teacherId, status: payload.status, session: payload.session, remarks: payload.remarks })
            .where(eq(attendance.id, existing.id))
            .returning();
          saved.push(updated);
          continue;
        }

        const [created] = await tx.insert(attendance).values(payload).returning();
        saved.push(created);
      }
    });

    const userMap = await this.getUsersMap();
    return this.attachAttendanceUsers(saved, userMap);
  }

  async updateAttendance(id: number, updates: Partial<InsertAttendance>): Promise<AttendanceWithStudent | undefined> {
    const [existing] = await db.select().from(attendance).where(eq(attendance.id, id));
    if (!existing) return undefined;

    const payload = this.normalizeAttendance({
      studentId: existing.studentId,
      teacherId: existing.teacherId,
      date: existing.date,
      status: existing.status,
      session: existing.session,
      remarks: existing.remarks ?? undefined,
      ...updates,
    });

    const [updated] = await db
      .update(attendance)
      .set({
        teacherId: payload.teacherId,
        studentId: payload.studentId,
        date: payload.date,
        status: payload.status,
        session: payload.session,
        remarks: payload.remarks,
      })
      .where(eq(attendance.id, id))
      .returning();

    if (!updated) return undefined;
    const userMap = await this.getUsersMap();
    return this.attachAttendanceUsers([updated], userMap)[0];
  }

  async getTeacherClasses(teacherId: number): Promise<{ className: string; studentCount: number; subjects: string[] }[]> {
    const [teacher, studentUsers, academicRecords, teacherAttendance] = await Promise.all([
      this.getUser(teacherId),
      this.getStudents(),
      this.getAcademics(),
      this.getAttendanceByTeacher(teacherId),
    ]);

    const classMap = new Map<string, Set<string>>();

    for (const record of academicRecords) {
      const className = record.className?.trim();
      if (record.teacherUserId === teacherId && className) {
        const subjects = classMap.get(className) ?? new Set<string>();
        subjects.add(record.title);
        classMap.set(className, subjects);
      }
    }

    for (const record of teacherAttendance) {
      const className = record.student?.className;
      if (!className) continue;
      const subjects = classMap.get(className) ?? new Set<string>();
      if (teacher?.subject) subjects.add(teacher.subject);
      classMap.set(className, subjects);
    }

    return Array.from(classMap.entries())
      .map(([className, subjects]) => ({
        className,
        studentCount: studentUsers.filter((student) => student.className === className).length,
        subjects: Array.from(subjects).sort(),
      }))
      .sort((left, right) => left.className.localeCompare(right.className));
  }

  async getStudentsByClass(className: string): Promise<User[]> {
    const students = await this.getStudents();
    return students.filter((student) => student.className === className).sort((left, right) => left.name.localeCompare(right.name));
  }

  async getQrProfiles(): Promise<QrProfileWithUser[]> {
    try {
      const [records, userMap] = await Promise.all([db.select().from(qrProfiles), this.getUsersMap()]);
      return this.attachQrProfileUsers(records, userMap);
    } catch (error) {
      if (!isMissingQrAttendanceTableError(error)) throw error;
      return [];
    }
  }

  async getQrProfile(userId: number): Promise<QrProfileWithUser | undefined> {
    const [record] = await db.select().from(qrProfiles).where(eq(qrProfiles.userId, userId));
    if (!record) return undefined;
    const userMap = await this.getUsersMap();
    return this.attachQrProfileUsers([record], userMap)[0];
  }

  async issueQrProfile(userId: number, generatedBy?: number): Promise<{ profile: QrProfileWithUser; token: string; created: boolean }> {
    const [existing] = await db.select().from(qrProfiles).where(eq(qrProfiles.userId, userId));

    if (existing) {
      const userMap = await this.getUsersMap();
      return {
        profile: this.attachQrProfileUsers([existing], userMap)[0],
        token: decryptQrToken(existing.tokenCiphertext),
        created: false,
      };
    }

    const publicId = generateQrPublicId();
    const token = generateQrToken(publicId);
    const timestamp = new Date().toISOString();
    const payload: InsertQrProfile = {
      userId,
      publicId,
      tokenCiphertext: encryptQrToken(token),
      tokenHash: hashQrToken(token),
      isActive: true,
      issuedAt: timestamp,
      regeneratedAt: timestamp,
      lastUsedAt: null,
      lastUsedBy: null,
      generatedBy: generatedBy ?? null,
    };

    const [created] = await db.insert(qrProfiles).values(payload).returning();
    const userMap = await this.getUsersMap();

    return {
      profile: this.attachQrProfileUsers([created], userMap)[0],
      token,
      created: true,
    };
  }

  async regenerateQrProfile(userId: number, generatedBy?: number): Promise<{ profile: QrProfileWithUser; token: string }> {
    const [existing] = await db.select().from(qrProfiles).where(eq(qrProfiles.userId, userId));

    if (!existing) {
      const issued = await this.issueQrProfile(userId, generatedBy);
      return { profile: issued.profile, token: issued.token };
    }

    const token = generateQrToken(existing.publicId);
    const timestamp = new Date().toISOString();

    const [updated] = await db
      .update(qrProfiles)
      .set({
        tokenCiphertext: encryptQrToken(token),
        tokenHash: hashQrToken(token),
        regeneratedAt: timestamp,
        generatedBy: generatedBy ?? existing.generatedBy,
        isActive: true,
      })
      .where(eq(qrProfiles.userId, userId))
      .returning();

    const userMap = await this.getUsersMap();
    return { profile: this.attachQrProfileUsers([updated], userMap)[0], token };
  }

  async setQrProfileActive(userId: number, isActive: boolean): Promise<QrProfileWithUser | undefined> {
    const [updated] = await db.update(qrProfiles).set({ isActive }).where(eq(qrProfiles.userId, userId)).returning();
    if (!updated) return undefined;
    const userMap = await this.getUsersMap();
    return this.attachQrProfileUsers([updated], userMap)[0];
  }

  async getQrAttendanceEvents(filters?: {
    userId?: number;
    role?: "student" | "teacher";
    attendanceDate?: string;
    scannedBy?: number;
  }): Promise<QrAttendanceEventWithUser[]> {
    try {
      const [records, userMap] = await Promise.all([db.select().from(qrAttendanceEvents), this.getUsersMap()]);

      return this.attachQrAttendanceUsers(records, userMap).filter((record) => {
        if (filters?.userId && record.userId !== filters.userId) return false;
        if (filters?.attendanceDate && record.attendanceDate !== filters.attendanceDate) return false;
        if (filters?.scannedBy && record.scannedBy !== filters.scannedBy) return false;
        if (filters?.role && record.user?.role !== filters.role) return false;
        return true;
      });
    } catch (error) {
      if (!isMissingQrAttendanceTableError(error)) throw error;
      return [];
    }
  }

  async getMyQrCard(userId: number): Promise<{
    profile: QrProfileWithUser;
    token: string;
    recentEvents: QrAttendanceEventWithUser[];
  } | undefined> {
    const user = await this.getUser(userId);

    if (!user || !["student", "teacher"].includes(user.role)) {
      return undefined;
    }

    const issued = await this.issueQrProfile(userId, userId);
    const recentEvents = (await this.getQrAttendanceEvents({ userId })).slice(0, 10);

    return {
      profile: issued.profile,
      token: issued.token,
      recentEvents,
    };
  }

  async scanQrAttendance(input: {
    token: string;
    scannedBy: number;
    direction: "Check In" | "Check Out";
    status?: "Present" | "Late";
    scanMethod: "camera" | "manual";
    terminalLabel?: string | null;
    notes?: string | null;
  }): Promise<{
    event: QrAttendanceEventWithUser;
    duplicate: boolean;
    attendanceRecord?: AttendanceWithStudent;
  } | undefined> {
    const tokenHash = hashQrToken(input.token);
    const [profile] = await db.select().from(qrProfiles).where(eq(qrProfiles.tokenHash, tokenHash));

    if (!profile || !profile.isActive) {
      return undefined;
    }

    const user = await this.getUser(profile.userId);
    if (!user || !["student", "teacher"].includes(user.role)) {
      return undefined;
    }

    const attendanceDate = getAttendanceDate();
    const scannedAt = new Date().toISOString();

    const [existingEvent] = await db
      .select()
      .from(qrAttendanceEvents)
      .where(
        and(
          eq(qrAttendanceEvents.userId, profile.userId),
          eq(qrAttendanceEvents.attendanceDate, attendanceDate),
          eq(qrAttendanceEvents.direction, input.direction),
        ),
      );

    let savedEvent = existingEvent;
    let duplicate = Boolean(existingEvent);

    if (!savedEvent) {
      const payload: typeof qrAttendanceEvents.$inferInsert = {
        userId: profile.userId,
        scannedBy: input.scannedBy,
        attendanceDate,
        scannedAt,
        roleSnapshot: user.role,
        direction: input.direction,
        status: input.direction === "Check In" ? input.status ?? "Present" : null,
        scanMethod: input.scanMethod,
        terminalLabel: input.terminalLabel ?? null,
        notes: input.notes ?? null,
      };

      try {
        [savedEvent] = await db.insert(qrAttendanceEvents).values(payload).returning();
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;

        duplicate = true;
        [savedEvent] = await db
          .select()
          .from(qrAttendanceEvents)
          .where(
            and(
              eq(qrAttendanceEvents.userId, profile.userId),
              eq(qrAttendanceEvents.attendanceDate, attendanceDate),
              eq(qrAttendanceEvents.direction, input.direction),
            ),
          );

        if (!savedEvent) throw error;
      }
    }

    await db
      .update(qrProfiles)
      .set({ lastUsedAt: scannedAt, lastUsedBy: input.scannedBy })
      .where(eq(qrProfiles.userId, profile.userId));

    let attendanceRecord: AttendanceWithStudent | undefined;
    if (user.role === "student" && input.direction === "Check In") {
      const savedAttendance = await this.createAttendance({
        studentId: user.id,
        teacherId: input.scannedBy,
        date: attendanceDate,
        status: input.status ?? "Present",
        session: "Full Day",
        remarks: input.notes ?? `QR ${input.scanMethod} check-in`,
      });
      const userMap = await this.getUsersMap();
      attendanceRecord = this.attachAttendanceUsers([savedAttendance], userMap)[0];
    }

    const userMap = await this.getUsersMap();

    return {
      event: this.attachQrAttendanceUsers([savedEvent], userMap)[0],
      duplicate,
      attendanceRecord,
    };
  }

  async getResult(id: number): Promise<Result | undefined> {
    const [record] = await db.select().from(results).where(eq(results.id, id));
    return record;
  }

  async getResults(): Promise<ResultWithStudent[]> {
    const [records, userMap] = await Promise.all([db.select().from(results), this.getUsersMap()]);
    return this.attachResultStudents(records, userMap);
  }

  async getResultsByStudent(studentId: number): Promise<ResultWithStudent[]> {
    const [records, userMap] = await Promise.all([
      db.select().from(results).where(eq(results.studentId, studentId)),
      this.getUsersMap(),
    ]);
    return this.attachResultStudents(records, userMap);
  }

  async createResult(record: InsertResult): Promise<Result> {
    const [newRecord] = await db.insert(results).values(this.normalizeResult(record)).returning();
    return newRecord;
  }

  async updateResult(id: number, updates: Partial<InsertResult>): Promise<Result | undefined> {
    const existing = await this.getResult(id);
    if (!existing) return undefined;

    const payload = this.normalizeResult({
      studentId: existing.studentId,
      subject: existing.subject,
      marks: existing.marks,
      grade: existing.grade,
      totalMarks: existing.totalMarks ?? undefined,
      examTitle: existing.examTitle ?? undefined,
      examType: existing.examType ?? undefined,
      term: existing.term ?? undefined,
      examDate: existing.examDate ?? undefined,
      remarks: existing.remarks ?? undefined,
      ...updates,
    });

    const [updated] = await db.update(results).set(payload).where(eq(results.id, id)).returning();
    return updated;
  }

  async deleteResult(id: number): Promise<boolean> {
    const [deleted] = await db.delete(results).where(eq(results.id, id)).returning({ id: results.id });
    return Boolean(deleted);
  }

  async getTimetableByClass(className: string): Promise<TimetableWithDetails[]> {
    const [records, academicRecords, userMap] = await Promise.all([
      db.select().from(timetable).where(eq(timetable.className, className)),
      this.getAcademics(),
      this.getUsersMap(),
    ]);

    if (records.length === 0) {
      return this.buildGeneratedTimetable(className, academicRecords);
    }

    const academicMap = new Map(academicRecords.map((record) => [record.id, record]));

    return records
      .map((record) => ({
        ...record,
        academic: record.academicId ? academicMap.get(record.academicId) : undefined,
        teacher: record.teacherId ? userMap.get(record.teacherId) : undefined,
      }))
      .sort(
        (left, right) =>
          `${left.dayOfWeek}-${String(left.sortOrder).padStart(2, "0")}`.localeCompare(
            `${right.dayOfWeek}-${String(right.sortOrder).padStart(2, "0")}`,
          ),
      );
  }

  async createTimetableItem(record: InsertTimetable): Promise<Timetable> {
    const [created] = await db.insert(timetable).values(record).returning();
    return created;
  }

  private async attachFeeRecords(records: Fee[]): Promise<FeeWithStudent[]> {
    if (records.length === 0) return [];

    const [userMap, paymentRows] = await Promise.all([
      this.getUsersMap(),
      db.select().from(feePayments).where(inArray(feePayments.feeId, records.map((record) => record.id))),
    ]);

    const paymentsByFeeId = new Map<number, FeePaymentWithMeta[]>();
    for (const payment of paymentRows) {
      const existing = paymentsByFeeId.get(payment.feeId) ?? [];
      existing.push({ ...payment, createdByUser: payment.createdBy ? userMap.get(payment.createdBy) : undefined });
      paymentsByFeeId.set(payment.feeId, existing);
    }

    return records
      .map((record) => ({
        ...record,
        ...summarizeFeeLedger(record.amount, record.paidAmount, record.dueDate),
        lineItems: Array.isArray(record.lineItems) && record.lineItems.length > 0
          ? record.lineItems
          : normalizeFeeLineItems(record.amount, record.description),
        student: userMap.get(record.studentId),
        payments: (paymentsByFeeId.get(record.id) ?? []).sort((left, right) => `${right.paymentDate}-${right.id}`.localeCompare(`${left.paymentDate}-${left.id}`)),
        paymentCount: (paymentsByFeeId.get(record.id) ?? []).length,
      }))
      .sort((left, right) => `${right.billingMonth}-${right.id}`.localeCompare(`${left.billingMonth}-${left.id}`));
  }

  private async attachBillingProfiles(records: StudentBillingProfile[]): Promise<StudentBillingProfileWithStudent[]> {
    if (records.length === 0) return [];
    const userMap = await this.getUsersMap();
    return records
      .map((record) => ({ ...record, student: userMap.get(record.studentId) }))
      .sort((left, right) => (left.student?.name ?? "").localeCompare(right.student?.name ?? ""));
  }

  private async createFeeRecord(executor: any, record: CreateFeeInput, invoicePrefix: string): Promise<Fee> {
    const timestamp = new Date().toISOString();
    const billingPeriod = record.billingPeriod?.trim() || formatBillingPeriod(record.billingMonth);
    const generatedMonth = record.generatedMonth ?? (record.source === "monthly" ? record.billingMonth : null);
    const lineItems = normalizeFeeLineItems(record.amount, record.description, record.lineItems);
    const ledger = summarizeFeeLedger(record.amount, 0, record.dueDate);

    if (generatedMonth) {
      const [existingGenerated] = await executor
        .select()
        .from(fees)
        .where(and(eq(fees.studentId, record.studentId), eq(fees.generatedMonth, generatedMonth)))
        .limit(1);
      if (existingGenerated) throw new Error(`Monthly invoice already exists for ${generatedMonth}`);
    }

    const [created] = await executor
      .insert(fees)
      .values({
        studentId: record.studentId,
        amount: record.amount,
        paidAmount: ledger.paidAmount,
        remainingBalance: ledger.remainingBalance,
        dueDate: record.dueDate,
        status: ledger.status,
        invoiceNumber: null,
        billingMonth: record.billingMonth,
        billingPeriod,
        description: record.description,
        feeType: record.feeType,
        source: record.source ?? "manual",
        generatedMonth,
        lineItems,
        notes: record.notes ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning();

    const invoiceNumber = buildDocumentNumber(invoicePrefix, created.id, new Date(timestamp));
    const [updated] = await executor
      .update(fees)
      .set({ invoiceNumber })
      .where(eq(fees.id, created.id))
      .returning();

    return updated ?? { ...created, invoiceNumber };
  }

  async getFees(): Promise<FeeWithStudent[]> {
    return this.attachFeeRecords(await db.select().from(fees));
  }

  async getFeesByStudent(studentId: number): Promise<FeeWithStudent[]> {
    return this.attachFeeRecords(await db.select().from(fees).where(eq(fees.studentId, studentId)));
  }

  async getFee(id: number): Promise<FeeWithStudent | undefined> {
    const [record] = await db.select().from(fees).where(eq(fees.id, id));
    if (!record) return undefined;
    const [hydrated] = await this.attachFeeRecords([record]);
    return hydrated;
  }

  async getFeePayments(filters: { month?: string; studentId?: number; method?: RecordFeePaymentInput["method"] } = {}): Promise<FeePaymentWithMeta[]> {
    const invoices = filters.studentId ? await this.getFeesByStudent(filters.studentId) : await this.getFees();
    return invoices
      .flatMap((invoice) => invoice.payments ?? [])
      .filter((payment) => {
        if (filters.month && payment.paymentDate.slice(0, 7) !== filters.month) return false;
        if (filters.method && payment.method !== filters.method) return false;
        return true;
      })
      .sort((left, right) => `${right.paymentDate}-${right.id}`.localeCompare(`${left.paymentDate}-${left.id}`));
  }

  async getPaymentReceipt(paymentId: number): Promise<{ invoice: FeeWithStudent; payment: FeePaymentWithMeta } | undefined> {
    const [paymentRecord] = await db.select().from(feePayments).where(eq(feePayments.id, paymentId)).limit(1);
    if (!paymentRecord) return undefined;
    const invoice = await this.getFee(paymentRecord.feeId);
    if (!invoice) return undefined;
    const payment = invoice.payments?.find((entry) => entry.id === paymentId);
    if (!payment) return undefined;
    return { invoice, payment };
  }

  async createFee(record: CreateFeeInput): Promise<FeeWithStudent> {
    const student = await this.getUser(record.studentId);
    if (!student || student.role !== "student") throw new Error("Student not found");

    const publicSettings = await this.getPublicSchoolSettings();
    const created = await db.transaction((tx) =>
      this.createFeeRecord(tx, record, publicSettings.financialSettings.invoicePrefix || "INV"),
    );

    return (await this.getFee(created.id)) as FeeWithStudent;
  }

  async updateFee(id: number, updates: UpdateFeeInput): Promise<FeeWithStudent | undefined> {
    const [existing] = await db.select().from(fees).where(eq(fees.id, id));
    if (!existing) return undefined;

    const studentId = updates.studentId ?? existing.studentId;
    const student = await this.getUser(studentId);
    if (!student || student.role !== "student") throw new Error("Student not found");

    const amount = updates.amount ?? existing.amount;
    if (amount < existing.paidAmount) throw new Error("Invoice total cannot be less than the amount already paid");

    const description = updates.description ?? existing.description;
    const billingMonth = updates.billingMonth ?? existing.billingMonth;
    const dueDate = updates.dueDate ?? existing.dueDate;
    const billingPeriod = updates.billingPeriod?.trim()
      || (updates.billingMonth && !updates.billingPeriod ? formatBillingPeriod(billingMonth) : existing.billingPeriod);
    const lineItems = normalizeFeeLineItems(
      amount,
      description,
      updates.lineItems ?? (amount === existing.amount ? existing.lineItems : undefined),
    );
    const generatedMonth = updates.generatedMonth ?? existing.generatedMonth;
    const ledger = summarizeFeeLedger(amount, existing.paidAmount, dueDate);

    const updated = await db.transaction(async (tx) => {
      if (generatedMonth) {
        const duplicates = await tx
          .select()
          .from(fees)
          .where(and(eq(fees.studentId, studentId), eq(fees.generatedMonth, generatedMonth)))
          .limit(5);
        if (duplicates.some((duplicate) => duplicate.id !== id)) throw new Error(`Monthly invoice already exists for ${generatedMonth}`);
      }

      const [saved] = await tx
        .update(fees)
        .set({
          studentId,
          amount,
          paidAmount: ledger.paidAmount,
          remainingBalance: ledger.remainingBalance,
          dueDate,
          status: ledger.status,
          billingMonth,
          billingPeriod,
          description,
          feeType: updates.feeType ?? existing.feeType,
          source: updates.source ?? existing.source,
          generatedMonth,
          lineItems,
          notes: updates.notes === undefined ? existing.notes : updates.notes ?? null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(fees.id, id))
        .returning();
      return saved;
    });

    if (!updated) return undefined;
    return this.getFee(id);
  }

  async deleteFee(id: number): Promise<boolean> {
    const [deleted] = await db.delete(fees).where(eq(fees.id, id)).returning({ id: fees.id });
    return Boolean(deleted);
  }

  async recordFeePayment(id: number, payment: RecordFeePaymentInput, createdBy?: number): Promise<FeeWithStudent | undefined> {
    const publicSettings = await this.getPublicSchoolSettings();
    const receiptPrefix = publicSettings.financialSettings.receiptPrefix || "RCT";

    const saved = await db.transaction(async (tx) => {
      const [feeRecord] = await tx.select().from(fees).where(eq(fees.id, id)).limit(1);
      if (!feeRecord) return undefined;
      if (payment.amount > feeRecord.remainingBalance) throw new Error("Payment amount cannot exceed the remaining balance");

      const timestamp = new Date().toISOString();
      const [createdPayment] = await tx
        .insert(feePayments)
        .values({
          feeId: feeRecord.id,
          studentId: feeRecord.studentId,
          amount: payment.amount,
          paymentDate: payment.paymentDate,
          method: payment.method,
          receiptNumber: null,
          reference: payment.reference ?? null,
          notes: payment.notes ?? null,
          createdAt: timestamp,
          createdBy: createdBy ?? null,
        })
        .returning();

      const paymentDate = new Date(payment.paymentDate);
      const receiptNumber = buildDocumentNumber(
        receiptPrefix,
        createdPayment.id,
        Number.isNaN(paymentDate.getTime()) ? new Date(timestamp) : paymentDate,
      );
      await tx.update(feePayments).set({ receiptNumber }).where(eq(feePayments.id, createdPayment.id));

      const ledger = summarizeFeeLedger(feeRecord.amount, feeRecord.paidAmount + payment.amount, feeRecord.dueDate);
      await tx
        .update(fees)
        .set({
          paidAmount: ledger.paidAmount,
          remainingBalance: ledger.remainingBalance,
          status: ledger.status,
          updatedAt: timestamp,
        })
        .where(eq(fees.id, feeRecord.id));

      return feeRecord.id;
    });

    if (!saved) return undefined;
    return this.getFee(saved);
  }

  async getBillingProfiles(): Promise<StudentBillingProfileWithStudent[]> {
    const records = await db.select().from(studentBillingProfiles);
    return this.attachBillingProfiles(records);
  }

  async upsertBillingProfile(input: BillingProfileInput): Promise<StudentBillingProfileWithStudent> {
    const student = await this.getUser(input.studentId);
    if (!student || student.role !== "student") throw new Error("Student not found");

    const timestamp = new Date().toISOString();
    const [saved] = await db
      .insert(studentBillingProfiles)
      .values({
        studentId: input.studentId,
        monthlyAmount: input.monthlyAmount,
        dueDay: input.dueDay,
        isActive: input.isActive,
        notes: input.notes ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: studentBillingProfiles.studentId,
        set: {
          monthlyAmount: input.monthlyAmount,
          dueDay: input.dueDay,
          isActive: input.isActive,
          notes: input.notes ?? null,
          updatedAt: timestamp,
        },
      })
      .returning();

    const [hydrated] = await this.attachBillingProfiles([saved]);
    return hydrated;
  }

  async generateMonthlyFees(input: GenerateMonthlyFeesInput) {
    const [studentUsers, billingProfiles, publicSettings] = await Promise.all([
      this.getStudents(),
      this.getBillingProfiles(),
      this.getPublicSchoolSettings(),
    ]);

    const profilesByStudentId = new Map(billingProfiles.map((profile) => [profile.studentId, profile]));
    const [existingGenerated] = await Promise.all([
      db.select({ studentId: fees.studentId }).from(fees).where(eq(fees.generatedMonth, input.billingMonth)),
    ]);
    const duplicateStudents = new Set(existingGenerated.map((record) => record.studentId));
    const skippedStudents: { studentId: number; studentName: string; reason: string }[] = [];
    const createdIds: number[] = [];
    let skippedDuplicates = 0;
    let skippedMissingProfiles = 0;

    await db.transaction(async (tx) => {
      for (const student of studentUsers) {
        const profile = profilesByStudentId.get(student.id);
        if (!profile || !profile.isActive) {
          skippedMissingProfiles += 1;
          skippedStudents.push({
            studentId: student.id,
            studentName: student.name,
            reason: profile ? "Billing profile is inactive" : "Missing billing profile",
          });
          continue;
        }

        if (duplicateStudents.has(student.id)) {
          skippedDuplicates += 1;
          skippedStudents.push({ studentId: student.id, studentName: student.name, reason: "Monthly invoice already generated" });
          continue;
        }

        const created = await this.createFeeRecord(
          tx,
          {
            studentId: student.id,
            amount: profile.monthlyAmount,
            billingMonth: input.billingMonth,
            billingPeriod: formatBillingPeriod(input.billingMonth),
            dueDate: buildDueDateForBillingMonth(input.billingMonth, input.dueDayOverride ?? profile.dueDay),
            description: `Monthly fee for ${formatBillingPeriod(input.billingMonth)}`,
            feeType: "Monthly Fee",
            source: "monthly",
            generatedMonth: input.billingMonth,
            lineItems: [{ label: `Monthly tuition for ${formatBillingPeriod(input.billingMonth)}`, amount: profile.monthlyAmount }],
            notes: profile.notes ?? null,
          },
          publicSettings.financialSettings.invoicePrefix || "INV",
        );

        duplicateStudents.add(student.id);
        createdIds.push(created.id);
      }
    });

    const invoices = createdIds.length
      ? await this.attachFeeRecords(await db.select().from(fees).where(inArray(fees.id, createdIds)))
      : [];

    return {
      billingMonth: input.billingMonth,
      generatedCount: invoices.length,
      skippedDuplicates,
      skippedMissingProfiles,
      invoices,
      skippedStudents,
    };
  }

  async getFinanceReport(filters: FinanceReportFilters = {}) {
    const baseInvoices = filters.studentId ? await this.getFeesByStudent(filters.studentId) : await this.getFees();
    const invoices = baseInvoices.filter((invoice) => {
      if (filters.month && invoice.billingMonth !== filters.month) return false;
      if (filters.status && invoice.status !== filters.status) return false;
      return true;
    });

    return buildFinanceReportSnapshot(invoices);
  }

  async getFeeBalanceSummary(): Promise<FeeBalanceSummary> {
    return buildFeeBalanceSummary(await this.getFees());
  }

  async getStudentBalance(studentId: number): Promise<StudentBalanceSummary> {
    const invoices = await this.getFeesByStudent(studentId);
    const summary = buildStudentBalanceSummary(studentId, invoices);
    if (invoices.length > 0) return summary;
    const student = await this.getUser(studentId);
    return {
      ...summary,
      studentName: student?.name ?? summary.studentName,
      className: student?.className ?? summary.className,
    };
  }

  async getOverdueBalances(): Promise<OverdueBalanceEntry[]> {
    return buildOverdueBalanceEntries(await this.getFees());
  }

  async getTotalStudents(): Promise<number> {
    await this.syncRoleProfiles();
    const [result] = await db.select({ value: count() }).from(students);
    return result.value || 0;
  }

  async getTotalTeachers(): Promise<number> {
    await this.syncRoleProfiles();
    const [result] = await db.select({ value: count() }).from(teachers);
    return result.value || 0;
  }

  async getFeesCollected(): Promise<number> {
    const [result] = await db.select({ value: sum(fees.paidAmount) }).from(fees);
    return Number(result.value) || 0;
  }

  async getActiveClassesCount(): Promise<number> {
    await this.syncRoleProfiles();
    const studentRecords = await db.select({ className: students.className }).from(students);
    return new Set(studentRecords.map((student) => student.className).filter(Boolean)).size;
  }

  async getSchoolSettings(): Promise<AdminSchoolSettingsResponse> {
    try {
      const record = await this.ensureSchoolSettingsRecord();
      const [versionRows, auditRows] = await Promise.all([
        db.select().from(schoolSettingsVersions).where(eq(schoolSettingsVersions.settingsId, record.id)).orderBy(desc(schoolSettingsVersions.version)),
        db.select().from(schoolSettingsAuditLogs).where(eq(schoolSettingsAuditLogs.settingsId, record.id)).orderBy(desc(schoolSettingsAuditLogs.createdAt), desc(schoolSettingsAuditLogs.id)),
      ]);
      return this.buildSchoolSettingsResponse(record, versionRows, auditRows);
    } catch (error) {
      if (!isMissingSettingsTableError(error)) throw error;
      return this.buildFallbackSchoolSettingsResponse();
    }
  }

  async getPublicSchoolSettings(): Promise<PublicSchoolSettings> {
    const response = await this.getSchoolSettings();
    return response.publicSettings;
  }

  async updateSchoolSettings(data: SchoolSettingsData, updatedBy?: number, changeSummary?: string): Promise<AdminSchoolSettingsResponse> {
    return this.applySettingsMutation(data, "update", updatedBy, changeSummary ?? "Settings updated");
  }

  async importSchoolSettings(data: SchoolSettingsData, updatedBy?: number, changeSummary?: string): Promise<AdminSchoolSettingsResponse> {
    return this.applySettingsMutation(data, "import", updatedBy, changeSummary ?? "Settings imported");
  }

  async restoreSchoolSettings(version: number, updatedBy?: number, changeSummary?: string): Promise<AdminSchoolSettingsResponse | undefined> {
    return this.restoreFromVersion(version, updatedBy, changeSummary);
  }

  async exportSchoolSettings() {
    const response = await this.getSchoolSettings();
    return {
      exportedAt: new Date().toISOString(),
      version: response.settings.version,
      data: response.settings.data,
    };
  }

  async getStudentDashboardStats(studentId: number) {
    const [attendanceRecords, studentFees] = await Promise.all([this.getAttendanceByStudent(studentId), this.getFeesByStudent(studentId)]);
    const attendedCount = attendanceRecords.filter((record) => ["Present", "Late", "Excused"].includes(record.status)).length;
    return {
      attendanceRate: attendanceRecords.length ? Math.round((attendedCount / attendanceRecords.length) * 100) : 0,
      unpaidFees: studentFees.reduce((sum, record) => sum + record.remainingBalance, 0),
      openInvoices: studentFees.filter((record) => record.remainingBalance > 0).length,
      overdueInvoices: studentFees.filter((record) => record.status === "Overdue").length,
    };
  }

  async getAdminDashboardStats() {
    const [totalStudents, totalTeachers, feesCollected, activeClasses, report, allAttendance, publicSettings] = await Promise.all([
      this.getTotalStudents(),
      this.getTotalTeachers(),
      this.getFeesCollected(),
      this.getActiveClassesCount(),
      this.getFinanceReport(),
      this.getAttendance(),
      this.getPublicSchoolSettings(),
    ]);

    const now = new Date();
    const today = toIsoDate(now);
    const locale = publicSettings.financialSettings.locale || "en-US";
    const currencyCode = publicSettings.financialSettings.currencyCode || "USD";
    const monthFormatter = new Intl.DateTimeFormat(locale, { month: "short", timeZone: publicSettings.financialSettings.timezone || "UTC" });
    const dateFormatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: publicSettings.financialSettings.timezone || "UTC",
    });
    const currencyFormatter = new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode, maximumFractionDigits: 0 });

    const recentActivities = [
      ...report.payments.map((payment) => {
        const paymentDate = new Date(payment.paymentDate);
        const invoice = report.invoices.find((record) => record.id === payment.feeId);
        const studentName = invoice?.student?.name ?? `Student #${payment.studentId}`;
        return {
          id: `payment-${payment.id}`,
          type: "fee" as const,
          title: "Payment recorded",
          description: `${studentName} paid ${currencyFormatter.format(payment.amount)} toward ${invoice?.invoiceNumber ?? `invoice #${payment.feeId}`}.`,
          dateLabel: Number.isNaN(paymentDate.getTime()) ? payment.paymentDate : dateFormatter.format(paymentDate),
          sortValue: Number.isNaN(paymentDate.getTime()) ? 0 : paymentDate.getTime(),
        };
      }),
      ...report.invoices.filter((feeRecord) => feeRecord.remainingBalance > 0).map((feeRecord) => {
        const feeDate = new Date(feeRecord.dueDate);
        const studentName = feeRecord.student?.name ?? `Student #${feeRecord.studentId}`;
        return {
          id: `fee-${feeRecord.id}`,
          type: "fee" as const,
          title: feeRecord.status === "Overdue" ? "Invoice overdue" : "Outstanding invoice",
          description: `${studentName} owes ${currencyFormatter.format(feeRecord.remainingBalance)} on ${feeRecord.invoiceNumber ?? `invoice #${feeRecord.id}`}.`,
          dateLabel: Number.isNaN(feeDate.getTime()) ? feeRecord.dueDate : dateFormatter.format(feeDate),
          sortValue: Number.isNaN(feeDate.getTime()) ? 0 : feeDate.getTime(),
        };
      }),
      ...allAttendance.map((attendanceRecord) => {
        const attendanceDate = new Date(attendanceRecord.date);
        const studentName = attendanceRecord.student?.name ?? `Student #${attendanceRecord.studentId}`;
        return {
          id: `attendance-${attendanceRecord.id}`,
          type: "attendance" as const,
          title: "Attendance updated",
          description: `${studentName} was marked ${attendanceRecord.status.toLowerCase()}.`,
          dateLabel: Number.isNaN(attendanceDate.getTime()) ? attendanceRecord.date : dateFormatter.format(attendanceDate),
          sortValue: Number.isNaN(attendanceDate.getTime()) ? 0 : attendanceDate.getTime(),
        };
      }),
    ]
      .sort((left, right) => right.sortValue - left.sortValue)
      .slice(0, 5)
      .map(({ sortValue, ...activity }) => activity);

    return {
      totalStudents,
      totalTeachers,
      feesCollected,
      activeClasses,
      outstandingFees: report.summary.totalOutstanding,
      pendingPayments: report.invoices.filter((feeRecord) => feeRecord.remainingBalance > 0).length,
      overdueInvoices: report.summary.overdueInvoices,
      attendanceMarkedToday: allAttendance.filter((record) => record.date === today).length,
      monthlyRevenue: report.monthlyRevenue.map((bucket) => ({
        month: monthFormatter.format(new Date(`${bucket.month}-01T00:00:00`)),
        revenue: bucket.paid,
      })),
      recentActivity: recentActivities,
    };
  }
}

export const storage = new DatabaseStorage();