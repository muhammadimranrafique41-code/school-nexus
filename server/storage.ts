import { and, count, desc, eq, inArray, sql, sum } from "drizzle-orm";
import {
  academics,
  attendance,
  dailyDiary,
  diaryTemplates,
  feeAdjustments,
  financeLedgerEntries,
  financeVoucherOperations,
  financeVouchers,
  feePayments,
  fees,
  homeworkDiary,
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
  type DailyDiary,
  type DiaryTemplate,
  type Fee,
  type FeeAdjustment,
  type FinanceLedgerEntry,
  type FinanceVoucher,
  type FinanceVoucherOperation,
  type FinanceVoucherOperationWithMeta,
  type FinanceVoucherWithMeta,
  type FeePaymentWithMeta,
  type FeeWithStudent,
  type HomeworkDiary,
  type InsertFinanceVoucher,
  type InsertFinanceVoucherOperation,
  type InsertFinanceLedgerEntry,
  type InsertAcademic,
  type InsertAttendance,
  type InsertDailyDiary,
  type InsertDiaryTemplate,
  type InsertHomeworkDiary,
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
  buildFinanceVoucherFileName,
  buildFinanceVoucherPreview,
  buildFinanceReportSnapshot,
  buildOverdueBalanceEntries,
  buildStudentBalanceSummary,
  buildDocumentNumber,
  buildDueDateForBillingMonth,
  formatBillingPeriod,
  normalizeFeeLineItems,
  normalizeFinanceVoucherSelection,
  summarizeFeeLedger,
  toIsoDate,
  type BillingProfileInput,
  type CreateFeeInput,
  type CreateFeeAdjustmentInput,
  type FeeBalanceSummary,
  type FinanceVoucherOperationRecord,
  type FinanceVoucherPreview,
  type FinanceVoucherPreviewInput,
  type FinanceVoucherSelectionInput,
  type FinanceVoucherStartInput,
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

const generatedDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const generatedSlots = [
  { periodLabel: "Period 1", startTime: "08:00", endTime: "08:40" },
  { periodLabel: "Period 2", startTime: "08:40", endTime: "09:20" },
  { periodLabel: "Period 3", startTime: "09:20", endTime: "10:00" },
  { periodLabel: "Period 4", startTime: "10:15", endTime: "10:55" }, // Break 10:00 - 10:15
  { periodLabel: "Period 5", startTime: "10:55", endTime: "11:35" },
  { periodLabel: "Period 6", startTime: "11:35", endTime: "12:15" },
  { periodLabel: "Period 7", startTime: "12:15", endTime: "12:55" },
] as const;

type RuntimeSettingsState = {
  current: SchoolSettings;
  versions: SchoolSettingsVersion[];
  auditLogs: SchoolSettingsAuditLog[];
  nextVersionId: number;
  nextAuditId: number;
};

type RuntimeQrState = {
  profiles: Map<number, QrProfile>;
  events: QrAttendanceEvent[];
  nextEventId: number;
};

type QrAttendanceEventFilters = {
  userId?: number;
  role?: "student" | "teacher";
  attendanceDate?: string;
  scannedBy?: number;
};

type QrAttendanceScanInput = {
  token: string;
  scannedBy: number;
  direction: "Check In" | "Check Out";
  status?: "Present" | "Late";
  scanMethod: "camera" | "manual";
  terminalLabel?: string | null;
  notes?: string | null;
};

type FinanceReportFilters = {
  month?: string;
  studentId?: number;
  status?: FeeStatus;
};

type FinanceVoucherSelectionPlan = {
  selection: FinanceVoucherSelectionInput;
  invoices: FeeWithStudent[];
  vouchersByFeeId: Map<number, FinanceVoucherWithMeta>;
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

const createRuntimeQrState = (): RuntimeQrState => ({
  profiles: new Map<number, QrProfile>(),
  events: [],
  nextEventId: 1,
});

const runtimeSettingsState = createRuntimeSettingsState();
const runtimeQrState = createRuntimeQrState();

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
  getFeeAdjustments(feeId: number): Promise<FeeAdjustmentWithMeta[]>;
  getPaymentReceipt(paymentId: number): Promise<{ invoice: FeeWithStudent; payment: FeePaymentWithMeta } | undefined>;
  createFee(record: CreateFeeInput): Promise<FeeWithStudent>;
  createFeeAdjustment(feeId: number, input: CreateFeeAdjustmentInput, createdBy: number): Promise<FeeWithStudent | undefined>;
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
  previewFinanceVoucherSelection(input: FinanceVoucherPreviewInput): Promise<FinanceVoucherPreview>;
  createFinanceVoucherOperation(input: FinanceVoucherStartInput, requestedBy?: number): Promise<FinanceVoucherOperationRecord>;
  getFinanceVoucherOperation(id: number): Promise<FinanceVoucherOperationRecord | undefined>;
  updateFinanceVoucherOperation(id: number, updates: Partial<InsertFinanceVoucherOperation>): Promise<FinanceVoucherOperationRecord | undefined>;
  listFinanceVoucherOperations(limit?: number): Promise<FinanceVoucherOperationRecord[]>;
  getFinanceVouchersByFeeIds(feeIds: number[]): Promise<FinanceVoucherWithMeta[]>;
  saveFinanceVoucher(record: Omit<InsertFinanceVoucher, "generatedAt"> & { generatedAt?: string }): Promise<FinanceVoucherWithMeta>;
  getLedgerEntriesByStudent(studentId: number): Promise<FinanceLedgerEntry[]>;

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
    recentVoucherOperations: FinanceVoucherOperationRecord[];
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

  private filterQrAttendanceEvents(records: QrAttendanceEventWithUser[], filters?: QrAttendanceEventFilters) {
    return records.filter((record) => {
      if (filters?.userId && record.userId !== filters.userId) return false;
      if (filters?.attendanceDate && record.attendanceDate !== filters.attendanceDate) return false;
      if (filters?.scannedBy && record.scannedBy !== filters.scannedBy) return false;
      if (filters?.role && record.user?.role !== filters.role) return false;
      return true;
    });
  }

  private seedRuntimeQrProfile(record: QrProfile) {
    runtimeQrState.profiles.set(record.userId, record);
  }

  private async getRuntimeQrProfiles() {
    const userMap = await this.getUsersMap();
    return this.attachQrProfileUsers(Array.from(runtimeQrState.profiles.values()), userMap);
  }

  private async getRuntimeQrProfile(userId: number) {
    const record = runtimeQrState.profiles.get(userId);
    if (!record) return undefined;
    const userMap = await this.getUsersMap();
    return this.attachQrProfileUsers([record], userMap)[0];
  }

  private async issueRuntimeQrProfile(userId: number, generatedBy?: number): Promise<{ profile: QrProfileWithUser; token: string; created: boolean }> {
    const existing = runtimeQrState.profiles.get(userId);

    if (existing) {
      return {
        profile: (await this.getRuntimeQrProfile(userId)) as QrProfileWithUser,
        token: decryptQrToken(existing.tokenCiphertext),
        created: false,
      };
    }

    const publicId = generateQrPublicId();
    const token = generateQrToken(publicId);
    const timestamp = new Date().toISOString();
    const created: QrProfile = {
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

    runtimeQrState.profiles.set(userId, created);

    return {
      profile: (await this.getRuntimeQrProfile(userId)) as QrProfileWithUser,
      token,
      created: true,
    };
  }

  private async regenerateRuntimeQrProfile(userId: number, generatedBy?: number): Promise<{ profile: QrProfileWithUser; token: string }> {
    const existing = runtimeQrState.profiles.get(userId);

    if (!existing) {
      const issued = await this.issueRuntimeQrProfile(userId, generatedBy);
      return { profile: issued.profile, token: issued.token };
    }

    const token = generateQrToken(existing.publicId);
    const updated: QrProfile = {
      ...existing,
      tokenCiphertext: encryptQrToken(token),
      tokenHash: hashQrToken(token),
      regeneratedAt: new Date().toISOString(),
      generatedBy: generatedBy ?? existing.generatedBy,
      isActive: true,
    };

    runtimeQrState.profiles.set(userId, updated);
    return { profile: (await this.getRuntimeQrProfile(userId)) as QrProfileWithUser, token };
  }

  private async setRuntimeQrProfileActive(userId: number, isActive: boolean) {
    const existing = runtimeQrState.profiles.get(userId);
    if (!existing) return undefined;

    runtimeQrState.profiles.set(userId, { ...existing, isActive });
    return this.getRuntimeQrProfile(userId);
  }

  private async getRuntimeQrAttendanceEvents(filters?: QrAttendanceEventFilters) {
    const userMap = await this.getUsersMap();
    return this.filterQrAttendanceEvents(this.attachQrAttendanceUsers(runtimeQrState.events, userMap), filters);
  }

  private async scanRuntimeQrAttendance(input: QrAttendanceScanInput): Promise<{
    event: QrAttendanceEventWithUser;
    duplicate: boolean;
    attendanceRecord?: AttendanceWithStudent;
  } | undefined> {
    const tokenHash = hashQrToken(input.token);
    const profile = Array.from(runtimeQrState.profiles.values()).find((record) => record.tokenHash === tokenHash);

    if (!profile || !profile.isActive) {
      return undefined;
    }

    const user = await this.getUser(profile.userId);
    if (!user || !["student", "teacher"].includes(user.role)) {
      return undefined;
    }

    const attendanceDate = getAttendanceDate();
    const scannedAt = new Date().toISOString();
    const roleSnapshot = user.role === "teacher" ? "teacher" : "student";
    const direction: QrAttendanceEvent["direction"] = input.direction === "Check In" ? "Check In" : "Check Out";
    const scanMethod: QrAttendanceEvent["scanMethod"] = input.scanMethod === "camera" ? "camera" : "manual";
    const existingEvent = runtimeQrState.events.find(
      (record) =>
        record.userId === profile.userId
        && record.attendanceDate === attendanceDate
        && record.direction === direction,
    );

    const duplicate = Boolean(existingEvent);
    const savedEvent: QrAttendanceEvent = existingEvent ?? {
      id: runtimeQrState.nextEventId++,
      userId: profile.userId,
      scannedBy: input.scannedBy,
      attendanceDate,
      scannedAt,
      roleSnapshot,
      direction,
      status: direction === "Check In" ? input.status ?? "Present" : null,
      scanMethod,
      terminalLabel: input.terminalLabel ?? null,
      notes: input.notes ?? null,
    };

    if (!existingEvent) {
      runtimeQrState.events.push(savedEvent);
    }

    runtimeQrState.profiles.set(profile.userId, {
      ...profile,
      lastUsedAt: scannedAt,
      lastUsedBy: input.scannedBy,
    });

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
        generatedSlots.map((slot, slotIndex) => ({
          id: -(dayIndex * generatedSlots.length + slotIndex + 1),
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
      return this.getRuntimeQrProfiles();
    }
  }

  async getQrProfile(userId: number): Promise<QrProfileWithUser | undefined> {
    try {
      const [record] = await db.select().from(qrProfiles).where(eq(qrProfiles.userId, userId));
      if (!record) return undefined;
      const userMap = await this.getUsersMap();
      return this.attachQrProfileUsers([record], userMap)[0];
    } catch (error) {
      if (!isMissingQrAttendanceTableError(error)) throw error;
      return this.getRuntimeQrProfile(userId);
    }
  }

  async issueQrProfile(userId: number, generatedBy?: number): Promise<{ profile: QrProfileWithUser; token: string; created: boolean }> {
    try {
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
    } catch (error) {
      if (!isMissingQrAttendanceTableError(error)) throw error;
      return this.issueRuntimeQrProfile(userId, generatedBy);
    }
  }

  async regenerateQrProfile(userId: number, generatedBy?: number): Promise<{ profile: QrProfileWithUser; token: string }> {
    try {
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
    } catch (error) {
      if (!isMissingQrAttendanceTableError(error)) throw error;
      return this.regenerateRuntimeQrProfile(userId, generatedBy);
    }
  }

  async setQrProfileActive(userId: number, isActive: boolean): Promise<QrProfileWithUser | undefined> {
    try {
      const [updated] = await db.update(qrProfiles).set({ isActive }).where(eq(qrProfiles.userId, userId)).returning();
      if (!updated) return undefined;
      const userMap = await this.getUsersMap();
      return this.attachQrProfileUsers([updated], userMap)[0];
    } catch (error) {
      if (!isMissingQrAttendanceTableError(error)) throw error;
      return this.setRuntimeQrProfileActive(userId, isActive);
    }
  }

  async getQrAttendanceEvents(filters?: QrAttendanceEventFilters): Promise<QrAttendanceEventWithUser[]> {
    try {
      const [records, userMap] = await Promise.all([db.select().from(qrAttendanceEvents), this.getUsersMap()]);

      return this.filterQrAttendanceEvents(this.attachQrAttendanceUsers(records, userMap), filters);
    } catch (error) {
      if (!isMissingQrAttendanceTableError(error)) throw error;
      return this.getRuntimeQrAttendanceEvents(filters);
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

  async scanQrAttendance(input: QrAttendanceScanInput): Promise<{
    event: QrAttendanceEventWithUser;
    duplicate: boolean;
    attendanceRecord?: AttendanceWithStudent;
  } | undefined> {
    let dbProfile: QrProfile | undefined;

    try {
      const tokenHash = hashQrToken(input.token);
      const [profile] = await db.select().from(qrProfiles).where(eq(qrProfiles.tokenHash, tokenHash));
      dbProfile = profile;

      if (!profile || !profile.isActive) {
        return undefined;
      }

      const user = await this.getUser(profile.userId);
      if (!user || !["student", "teacher"].includes(user.role)) {
        return undefined;
      }

      const attendanceDate = getAttendanceDate();
      const scannedAt = new Date().toISOString();
      const roleSnapshot = user.role === "teacher" ? "teacher" : "student";
      const direction: QrAttendanceEvent["direction"] = input.direction === "Check In" ? "Check In" : "Check Out";
      const scanMethod: QrAttendanceEvent["scanMethod"] = input.scanMethod === "camera" ? "camera" : "manual";

      const [existingEvent] = await db
        .select()
        .from(qrAttendanceEvents)
        .where(
          and(
            eq(qrAttendanceEvents.userId, profile.userId),
            eq(qrAttendanceEvents.attendanceDate, attendanceDate),
            eq(qrAttendanceEvents.direction, direction),
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
          roleSnapshot,
          direction,
          status: direction === "Check In" ? input.status ?? "Present" : null,
          scanMethod,
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
                eq(qrAttendanceEvents.direction, direction),
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
    } catch (error) {
      if (!isMissingQrAttendanceTableError(error)) throw error;
      if (dbProfile) this.seedRuntimeQrProfile(dbProfile);
      return this.scanRuntimeQrAttendance(input);
    }
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

    const [userMap, paymentRows, adjustmentRows] = await Promise.all([
      this.getUsersMap(),
      db.select().from(feePayments).where(inArray(feePayments.feeId, records.map((record) => record.id))),
      db.select().from(feeAdjustments).where(inArray(feeAdjustments.feeId, records.map((record) => record.id))),
    ]);

    const paymentsByFeeId = new Map<number, FeePaymentWithMeta[]>();
    for (const payment of paymentRows) {
      const existing = paymentsByFeeId.get(payment.feeId) ?? [];
      existing.push({
        ...payment,
        discount: payment.discount ?? 0,
        discountReason: payment.discountReason ?? null,
        createdByUser: payment.createdBy ? userMap.get(payment.createdBy) : undefined,
      });
      paymentsByFeeId.set(payment.feeId, existing);
    }

    const adjustmentsByFeeId = new Map<number, FeeAdjustmentWithMeta[]>();
    for (const adjustment of adjustmentRows) {
      const existing = adjustmentsByFeeId.get(adjustment.feeId) ?? [];
      existing.push({ ...adjustment, createdByUser: userMap.get(adjustment.createdBy) });
      adjustmentsByFeeId.set(adjustment.feeId, existing);
    }

    return records
      .map((record) => {
        const ledger = summarizeFeeLedger(record.amount, record.paidAmount, record.dueDate);
        const remainingBalance = record.remainingBalance;
        const status = remainingBalance <= 0 ? "Paid" : ledger.status;
        return {
          ...record,
          ...ledger,
          remainingBalance,
          status,
          totalDiscount: record.totalDiscount ?? 0,
          lineItems: Array.isArray(record.lineItems) && record.lineItems.length > 0
            ? record.lineItems
            : normalizeFeeLineItems(record.amount, record.description),
          student: userMap.get(record.studentId),
          payments: (paymentsByFeeId.get(record.id) ?? []).sort((left, right) => `${right.paymentDate}-${right.id}`.localeCompare(`${left.paymentDate}-${left.id}`)),
          adjustments: (adjustmentsByFeeId.get(record.id) ?? []).sort((left, right) => `${right.createdAt}`.localeCompare(`${left.createdAt}`)),
          paymentCount: (paymentsByFeeId.get(record.id) ?? []).length,
        };
      })
      .sort((left, right) => `${right.billingMonth}-${right.id}`.localeCompare(`${left.billingMonth}-${left.id}`));
  }

  private async attachBillingProfiles(records: StudentBillingProfile[]): Promise<StudentBillingProfileWithStudent[]> {
    if (records.length === 0) return [];
    const userMap = await this.getUsersMap();
    return records
      .map((record) => ({ ...record, student: userMap.get(record.studentId) }))
      .sort((left, right) => (left.student?.name ?? "").localeCompare(right.student?.name ?? ""));
  }

  private async attachFinanceVouchers(records: FinanceVoucher[]): Promise<FinanceVoucherWithMeta[]> {
    if (records.length === 0) return [];
    const userMap = await this.getUsersMap();
    return records
      .map((record) => ({ ...record, generatedByUser: record.generatedBy ? userMap.get(record.generatedBy) : undefined }))
      .sort((left, right) => `${right.generatedAt}-${right.id}`.localeCompare(`${left.generatedAt}-${left.id}`));
  }

  private async attachFinanceVoucherOperations(records: FinanceVoucherOperation[]): Promise<FinanceVoucherOperationRecord[]> {
    if (records.length === 0) return [];
    const userMap = await this.getUsersMap();
    return records
      .map((record) => ({
        ...record,
        requestedByName: record.requestedBy ? userMap.get(record.requestedBy)?.name ?? null : null,
      }))
      .sort((left, right) => `${right.createdAt}-${right.id}`.localeCompare(`${left.createdAt}-${left.id}`));
  }

  private async getFinanceVoucherSelectionPlan(input: FinanceVoucherSelectionInput): Promise<FinanceVoucherSelectionPlan> {
    const selection = normalizeFinanceVoucherSelection(input);
    const invoices = (await this.getFees())
      .filter((invoice) => selection.billingMonths.includes(invoice.billingMonth))
      .filter((invoice) => selection.classNames.length === 0 || selection.classNames.includes(invoice.student?.className ?? ""))
      .filter((invoice) => selection.studentIds.length === 0 || selection.studentIds.includes(invoice.studentId))
      .sort((left, right) =>
        `${left.billingMonth}-${left.student?.className ?? ""}-${left.student?.name ?? ""}-${left.id}`.localeCompare(
          `${right.billingMonth}-${right.student?.className ?? ""}-${right.student?.name ?? ""}-${right.id}`,
        ),
      );

    const voucherRows = await this.getFinanceVouchersByFeeIds(invoices.map((invoice) => invoice.id));
    return {
      selection,
      invoices,
      vouchersByFeeId: new Map(voucherRows.map((record) => [record.feeId, record])),
    };
  }

  private async createFeeRecord(executor: any, record: CreateFeeInput, invoicePrefix: string): Promise<Fee> {
    const timestamp = new Date().toISOString();
    const billingPeriod = record.billingPeriod?.trim() || formatBillingPeriod(record.billingMonth);
    const generatedMonth = record.generatedMonth ?? (record.source === "monthly" ? record.billingMonth : null);
    const lineItems = normalizeFeeLineItems(record.amount, record.description, record.lineItems);
    const upfrontDiscount = record.discount ?? 0;  // Upfront discount provided during invoice creation
    const ledger = summarizeFeeLedger(record.amount, 0, record.dueDate);

    if (generatedMonth) {
      const [existingGenerated] = await executor
        .select()
        .from(fees)
        .where(and(eq(fees.studentId, record.studentId), eq(fees.generatedMonth, generatedMonth)))
        .limit(1);
      if (existingGenerated) throw new Error(`Monthly invoice already exists for ${generatedMonth}`);
    }

    // Calculate remaining balance after applying upfront discount
    const remainingBalanceAfterDiscount = Math.max(0, ledger.remainingBalance - upfrontDiscount);

    const [created] = await executor
      .insert(fees)
      .values({
        studentId: record.studentId,
        amount: record.amount,
        paidAmount: ledger.paidAmount,
        totalDiscount: upfrontDiscount,  // Store upfront discount in totalDiscount field
        remainingBalance: remainingBalanceAfterDiscount,
        dueDate: record.dueDate,
        status: upfrontDiscount >= record.amount ? "Paid" : ledger.status,  // If discount covers full amount, mark as Paid
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

  async getFeeAdjustments(feeId: number): Promise<FeeAdjustmentWithMeta[]> {
    const userMap = await this.getUsersMap();
    const records = await db.select().from(feeAdjustments).where(eq(feeAdjustments.feeId, feeId));
    return records
      .map((record) => ({ ...record, createdByUser: userMap.get(record.createdBy) }))
      .sort((left, right) => `${right.createdAt}`.localeCompare(`${left.createdAt}`));
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
    
    // Validate discount is not greater than amount
    const discount = record.discount ?? 0;
    if (discount > record.amount) {
      throw new Error("Discount cannot exceed invoice amount");
    }

    const created = await db.transaction((tx) =>
      this.createFeeRecord(tx, record, publicSettings.financialSettings.invoicePrefix || "INV"),
    );

    // Log ledger entry for invoice creation
    const discountText = discount > 0 ? ` with discount of ${(discount / 100).toFixed(2)}` : "";
    await this.createLedgerEntry(record.studentId, "invoice", {
      feeId: created.id,
      debit: created.amount,
      credit: discount,
      referenceId: created.invoiceNumber ?? `FEE-${created.id}`,
      description: `Invoice created: ${created.description}${discountText}`,
      createdBy: undefined,
    });

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

    // Check for duplicate idempotency key
    if (payment.idempotencyKey) {
      const [existing] = await db
        .select()
        .from(feePayments)
        .where(and(eq(feePayments.feeId, id), eq(feePayments.idempotencyKey, payment.idempotencyKey)))
        .limit(1);
      if (existing) {
        // Idempotent: return the existing fee without creating a duplicate payment
        return this.getFee(id);
      }
    }

    const saved = await db.transaction(async (tx) => {
      const [feeRecord] = await tx.select().from(fees).where(eq(fees.id, id)).limit(1);
      if (!feeRecord) return undefined;
      
      // Validate payment amount is positive
      if (payment.amount <= 0) throw new Error("Payment amount must be greater than 0");

      // Validate discount separately - cannot exceed effective remaining balance
      const discount = payment.discount ?? 0;
      if (discount < 0) throw new Error("Discount cannot be negative");
      const priorPayments = await tx.select().from(feePayments).where(eq(feePayments.feeId, feeRecord.id));
      const priorPaymentDiscounts = priorPayments.reduce((sum, p) => sum + (p.discount || 0), 0);
      // effectiveRemaining already accounts for upfront invoice discount (baked into feeRecord.remainingBalance)
      const effectiveRemaining = Math.max(0, feeRecord.remainingBalance - priorPaymentDiscounts);
      if (discount > effectiveRemaining) throw new Error("Discount cannot exceed the remaining invoice balance");
      
      // Allow overpayment: payment can exceed remaining balance
      // This enables valid scenarios like: balance 1250, pay 1200 + discount 250 = full coverage

      const timestamp = new Date().toISOString();
      const [createdPayment] = await tx
        .insert(feePayments)
        .values({
          feeId: feeRecord.id,
          studentId: feeRecord.studentId,
          amount: payment.amount,
          discount: discount,
          discountReason: payment.discountReason ?? null,
          paymentDate: payment.paymentDate,
          method: payment.method,
          receiptNumber: null,
          reference: payment.reference ?? null,
          notes: payment.notes ?? null,
          idempotencyKey: payment.idempotencyKey ?? null,
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

      // Update fee: payment reduces remaining and discount also reduces remaining
      const newPaidAmount = feeRecord.paidAmount + payment.amount;
      const ledger = summarizeFeeLedger(feeRecord.amount, newPaidAmount, feeRecord.dueDate);
      
      // totalDiscounts = upfront invoice discount + all payment-level discounts (prior + current)
      const totalDiscounts = (feeRecord.totalDiscount ?? 0) + priorPaymentDiscounts + discount;
      const adjustedRemainingBalance = Math.max(0, ledger.remainingBalance - totalDiscounts);
      
      await tx
        .update(fees)
        .set({
          paidAmount: newPaidAmount,
          remainingBalance: adjustedRemainingBalance,
          totalDiscount: totalDiscounts,
          status: adjustedRemainingBalance === 0 ? "Paid" : ledger.status,
          updatedAt: timestamp,
        })
        .where(eq(fees.id, feeRecord.id));

      return feeRecord.id;
    });

    if (!saved) return undefined;

    // Log ledger entry for payment
    const feeRecord = await this.getFee(saved);
    if (feeRecord) {
      const discountAmount = payment.discount ?? 0;
      const discountText = discountAmount > 0 ? ` with discount of ${(discountAmount / 100).toFixed(2)}` : "";
      const ledgerDescription = `Payment of ${(payment.amount / 100).toFixed(2)} received via ${payment.method}${discountText}`;
      
      await this.createLedgerEntry(feeRecord.studentId, "payment", {
        feeId: saved,
        debit: 0,
        credit: payment.amount + discountAmount, // Credit both payment and discount
        referenceId: `PAY-${saved}`,
        description: ledgerDescription,
        createdBy,
      });
    }

    return feeRecord;
  }

  async createFeeAdjustment(feeId: number, input: CreateFeeAdjustmentInput, createdBy: number): Promise<FeeWithStudent | undefined> {
    const fee = await this.getFee(feeId);
    if (!fee) throw new Error("Fee not found");

    const timestamp = new Date().toISOString();
    const adjustment = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(feeAdjustments)
        .values({
          feeId,
          studentId: fee.studentId,
          type: input.type,
          amount: input.amount,
          reason: input.reason,
          notes: input.notes ?? null,
          createdAt: timestamp,
          createdBy,
        })
        .returning();
      return created;
    });

    if (!adjustment) return undefined;

    // Log ledger entry for adjustment
    const adjustmentLedgerType = input.type === "discount" || input.type === "scholarship" ? "discount" : input.type;
    const debit = (input.type === "fine") ? input.amount : 0;
    const credit = (input.type === "fine") ? 0 : input.amount;

    await this.createLedgerEntry(fee.studentId, adjustmentLedgerType as any, {
      feeId,
      debit,
      credit,
      referenceId: `ADJ-${feeId}-${adjustment.id}`,
      description: `${input.type}: ${input.reason}`,
      createdBy,
    });

    return this.getFee(feeId);
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

  async getFinanceVouchersByFeeIds(feeIds: number[]) {
    if (feeIds.length === 0) return [];
    const rows = await db.select().from(financeVouchers).where(inArray(financeVouchers.feeId, feeIds));
    return this.attachFinanceVouchers(rows);
  }

  async previewFinanceVoucherSelection(input: FinanceVoucherPreviewInput) {
    const plan = await this.getFinanceVoucherSelectionPlan(input);
    const previewInvoices = plan.invoices.map((invoice) => {
      const existingVoucher = plan.vouchersByFeeId.get(invoice.id);
      return {
        feeId: invoice.id,
        studentId: invoice.studentId,
        studentName: invoice.student?.name?.trim() || `Student #${invoice.studentId}`,
        className: invoice.student?.className ?? null,
        invoiceNumber: invoice.invoiceNumber ?? null,
        billingMonth: invoice.billingMonth,
        billingPeriod: invoice.billingPeriod,
        amount: invoice.amount,
        remainingBalance: invoice.remainingBalance,
        dueDate: invoice.dueDate,
        hasExistingVoucher: Boolean(existingVoucher),
        existingVoucherDocumentNumber: existingVoucher?.documentNumber ?? null,
        existingVoucherGeneratedAt: existingVoucher?.generatedAt ?? null,
      };
    });
    const preview = buildFinanceVoucherPreview(plan.selection, previewInvoices);
    return {
      ...preview,
      sampleInvoices: preview.sampleInvoices.slice(0, input.previewLimit),
    };
  }

  async createFinanceVoucherOperation(input: FinanceVoucherStartInput, requestedBy?: number) {
    const preview = await this.previewFinanceVoucherSelection({ ...input, previewLimit: 50 });
    const timestamp = new Date().toISOString();
    const [created] = await db.insert(financeVoucherOperations).values({
      requestedBy: requestedBy ?? null,
      status: "queued",
      billingMonths: preview.selection.billingMonths,
      classNames: preview.selection.classNames,
      studentIds: preview.selection.studentIds,
      force: preview.selection.force,
      totalInvoices: preview.targetInvoiceCount,
      generatedCount: 0,
      skippedCount: preview.skippedExistingCount,
      failedCount: 0,
      archiveSizeBytes: 0,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning();
    const [record] = await this.attachFinanceVoucherOperations([created]);
    return record;
  }

  async getFinanceVoucherOperation(id: number) {
    const [record] = await db.select().from(financeVoucherOperations).where(eq(financeVoucherOperations.id, id)).limit(1);
    if (!record) return undefined;
    const [withMeta] = await this.attachFinanceVoucherOperations([record]);
    return withMeta;
  }

  async updateFinanceVoucherOperation(id: number, updates: Partial<InsertFinanceVoucherOperation>) {
    const existing = await this.getFinanceVoucherOperation(id);
    if (!existing) return undefined;
    const [updated] = await db.update(financeVoucherOperations).set({
      ...updates,
      updatedAt: new Date().toISOString(),
    }).where(eq(financeVoucherOperations.id, id)).returning();
    const [withMeta] = await this.attachFinanceVoucherOperations([updated]);
    return withMeta;
  }

  async listFinanceVoucherOperations(limit = 10) {
    const rows = await db.select().from(financeVoucherOperations).orderBy(desc(financeVoucherOperations.createdAt), desc(financeVoucherOperations.id)).limit(limit);
    return this.attachFinanceVoucherOperations(rows);
  }

  async saveFinanceVoucher(record: Omit<InsertFinanceVoucher, "generatedAt"> & { generatedAt?: string }) {
    const timestamp = record.generatedAt ?? new Date().toISOString();
    const [existing] = await db.select().from(financeVouchers).where(eq(financeVouchers.feeId, record.feeId)).limit(1);
    let saved: FinanceVoucher;
    if (existing) {
      const [updated] = await db.update(financeVouchers).set({
        operationId: record.operationId ?? existing.operationId,
        documentNumber: record.documentNumber,
        fileName: record.fileName,
        billingMonth: record.billingMonth,
        generatedAt: timestamp,
        generatedBy: record.generatedBy ?? existing.generatedBy,
        generationVersion: (existing.generationVersion ?? 1) + 1,
      }).where(eq(financeVouchers.id, existing.id)).returning();
      saved = updated;
    } else {
      const [created] = await db.insert(financeVouchers).values({
        ...record,
        generatedAt: timestamp,
      }).returning();
      saved = created;
    }
    const [withMeta] = await this.attachFinanceVouchers([saved]);
    return withMeta;
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
    const [totalStudents, totalTeachers, feesCollected, activeClasses, report, allAttendance, publicSettings, recentVoucherOperations] = await Promise.all([
      this.getTotalStudents(),
      this.getTotalTeachers(),
      this.getFeesCollected(),
      this.getActiveClassesCount(),
      this.getFinanceReport(),
      this.getAttendance(),
      this.getPublicSchoolSettings(),
      this.listFinanceVoucherOperations(5),
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
      recentVoucherOperations,
    };
  }

  // ─── Homework Diary ──────────────────────────────────────────────────────

  async createHomeworkDiary(input: InsertHomeworkDiary & { classId: number; date: string }): Promise<HomeworkDiary> {
    const [created] = await db
      .insert(homeworkDiary)
      .values({
        classId: input.classId,
        date: input.date as unknown as Date,
        entries: input.entries ?? [],
        status: "draft",
        createdBy: input.createdBy,
      })
      .returning();
    return created;
  }

  async getHomeworkDiaryByClassDate(classId: number, date: string): Promise<HomeworkDiary | undefined> {
    const [record] = await db
      .select()
      .from(homeworkDiary)
      .where(and(eq(homeworkDiary.classId, classId), eq(homeworkDiary.date, date as unknown as Date)))
      .limit(1);
    return record;
  }

  async updateHomeworkDiary(id: number, input: Partial<{ entries: any; status: string }>): Promise<HomeworkDiary | undefined> {
    const [updated] = await db
      .update(homeworkDiary)
      .set({
        entries: input.entries,
        status: input.status as any,
      })
      .where(eq(homeworkDiary.id, id))
      .returning();
    return updated;
  }

  async deleteHomeworkDiary(id: number): Promise<boolean> {
    const result = await db.delete(homeworkDiary).where(eq(homeworkDiary.id, id));
    return !!result;
  }

  async getHomeworkDiariesByClass(classId: number): Promise<HomeworkDiary[]> {
    return db
      .select()
      .from(homeworkDiary)
      .where(eq(homeworkDiary.classId, classId))
      .orderBy(desc(homeworkDiary.date));
  }

  async getHomeworkDiariesByClassDateRange(classId: number, startDate: string, endDate: string): Promise<HomeworkDiary[]> {
    return db
      .select()
      .from(homeworkDiary)
      .where(
        and(
          eq(homeworkDiary.classId, classId),
          sql`${homeworkDiary.date} >= ${startDate}::date AND ${homeworkDiary.date} <= ${endDate}::date`,
        ),
      )
      .orderBy(desc(homeworkDiary.date));
  }

  async publishHomeworkDiary(id: number): Promise<HomeworkDiary | undefined> {
    const [updated] = await db
      .update(homeworkDiary)
      .set({ status: "published" })
      .where(eq(homeworkDiary.id, id))
      .returning();
    return updated;
  }

  // Diary Template Methods
  async createDiaryTemplate(input: InsertDiaryTemplate): Promise<DiaryTemplate> {
    const [created] = await db.insert(diaryTemplates).values(input).returning();
    return created;
  }

  async getDiaryTemplate(id: number): Promise<DiaryTemplate | undefined> {
    return db
      .select()
      .from(diaryTemplates)
      .where(eq(diaryTemplates.id, id))
      .then((rows) => rows[0]);
  }

  async getDiaryTemplatesByClass(classId: number): Promise<DiaryTemplate[]> {
    return db
      .select()
      .from(diaryTemplates)
      .where(eq(diaryTemplates.classId, classId))
      .orderBy(desc(diaryTemplates.createdAt));
  }

  async updateDiaryTemplate(id: number, input: Partial<InsertDiaryTemplate>): Promise<DiaryTemplate | undefined> {
    const [updated] = await db
      .update(diaryTemplates)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(diaryTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteDiaryTemplate(id: number): Promise<boolean> {
    const result = await db.delete(diaryTemplates).where(eq(diaryTemplates.id, id));
    return !!result;
  }

  // Daily Diary Methods
  async createDailyDiary(input: InsertDailyDiary): Promise<DailyDiary> {
    const [created] = await db.insert(dailyDiary).values(input).returning();
    return created;
  }

  async getDailyDiary(id: number): Promise<DailyDiary | undefined> {
    return db
      .select()
      .from(dailyDiary)
      .where(eq(dailyDiary.id, id))
      .then((rows) => rows[0]);
  }

  async getDailyDiaryByTemplateAndDate(templateId: number, date: string): Promise<DailyDiary | undefined> {
    return db
      .select()
      .from(dailyDiary)
      .where(
        and(
          eq(dailyDiary.templateId, templateId),
          sql`${dailyDiary.date} = ${date}::date`,
        ),
      )
      .then((rows) => rows[0]);
  }

  async getDailyDiariesByClass(classId: number): Promise<DailyDiary[]> {
    return db
      .select()
      .from(dailyDiary)
      .where(eq(dailyDiary.classId, classId))
      .orderBy(desc(dailyDiary.date));
  }

  async getDailyDiariesByClassAndDate(classId: number, date: string): Promise<DailyDiary | undefined> {
    return db
      .select()
      .from(dailyDiary)
      .where(
        and(
          eq(dailyDiary.classId, classId),
          sql`${dailyDiary.date} = ${date}::date`,
        ),
      )
      .then((rows) => rows[0]);
  }

  async updateDailyDiary(id: number, input: Partial<InsertDailyDiary>): Promise<DailyDiary | undefined> {
    const [updated] = await db
      .update(dailyDiary)
      .set({
        ...input,
        updatedAt: new Date(),
        ...(input.status === "published" && { publishedAt: new Date() }),
      })
      .where(eq(dailyDiary.id, id))
      .returning();
    return updated;
  }

  async deleteDailyDiary(id: number): Promise<boolean> {
    const result = await db.delete(dailyDiary).where(eq(dailyDiary.id, id));
    return !!result;
  }

  // Finance Ledger Helper Methods
  private async createLedgerEntry(
    studentId: number,
    type: InsertFinanceLedgerEntry["type"],
    entry: Omit<InsertFinanceLedgerEntry, "studentId" | "type" | "createdAt">,
  ): Promise<FinanceLedgerEntry> {
    // Calculate running balance for this student
    const studentEntries = await db
      .select()
      .from(financeLedgerEntries)
      .where(eq(financeLedgerEntries.studentId, studentId));

    let currentBalance = 0;
    for (const e of studentEntries) {
      currentBalance += (e.debit - e.credit);
    }

    const newBalance = currentBalance + (entry.debit - entry.credit);

    const [created] = await db
      .insert(financeLedgerEntries)
      .values({
        studentId,
        type,
        debit: entry.debit,
        credit: entry.credit,
        balanceAfter: newBalance,
        referenceId: entry.referenceId ?? null,
        description: entry.description ?? null,
        feeId: entry.feeId ?? null,
        createdAt: new Date().toISOString(),
        createdBy: entry.createdBy ?? null,
      })
      .returning();

    return created;
  }

  async getLedgerEntriesByStudent(studentId: number): Promise<FinanceLedgerEntry[]> {
    const entries = await db
      .select()
      .from(financeLedgerEntries)
      .where(eq(financeLedgerEntries.studentId, studentId));
    return entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async getLedgerEntriesByFee(feeId: number): Promise<FinanceLedgerEntry[]> {
    const entries = await db
      .select()
      .from(financeLedgerEntries)
      .where(eq(financeLedgerEntries.feeId, feeId));
    return entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
}

export const storage = new DatabaseStorage();