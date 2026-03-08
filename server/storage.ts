import { and, count, desc, eq, sql, sum } from "drizzle-orm";
import {
  academics,
  attendance,
  fees,
  results,
  schoolSettings,
  schoolSettingsAuditLogs,
  schoolSettingsVersions,
  students,
  teachers,
  timetable,
  type Academic,
  type AcademicWithTeacher,
  type Attendance,
  type AttendanceWithStudent,
  type Fee,
  type FeeWithStudent,
  type InsertAcademic,
  type InsertAttendance,
  type InsertFee,
  type InsertResult,
  type InsertTimetable,
  type InsertUser,
  type Result,
  type ResultWithStudent,
  type SchoolSettings,
  type SchoolSettingsAuditLog,
  type SchoolSettingsVersion,
  type Timetable,
  type TimetableWithDetails,
  type User,
  users,
} from "@shared/schema";
import type { AdminSchoolSettingsResponse, PublicSchoolSettings, SchoolSettingsAuditAction, SchoolSettingsData } from "@shared/settings";
import { schoolSettingsDataSchema } from "@shared/settings";
import { db } from "./db";
import {
  buildPublicSchoolSettings,
  buildSchoolSettingsCompletion,
  decryptSchoolSettingsData,
  diffSchoolSettings,
  encryptSchoolSettingsData,
  getSafeSchoolSettingsDefaults,
} from "./settings-service";

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
  createFee(record: InsertFee): Promise<Fee>;
  updateFee(id: number, updates: Partial<InsertFee>): Promise<Fee | undefined>;
  deleteFee(id: number): Promise<boolean>;

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

  async getFees(): Promise<FeeWithStudent[]> {
    const [records, userMap] = await Promise.all([db.select().from(fees), this.getUsersMap()]);
    return records.map((record) => ({ ...record, student: userMap.get(record.studentId) }));
  }

  async getFeesByStudent(studentId: number): Promise<FeeWithStudent[]> {
    const [records, userMap] = await Promise.all([
      db.select().from(fees).where(eq(fees.studentId, studentId)),
      this.getUsersMap(),
    ]);
    return records.map((record) => ({ ...record, student: userMap.get(record.studentId) }));
  }

  async createFee(record: InsertFee): Promise<Fee> {
    const [newRecord] = await db.insert(fees).values(record).returning();
    return newRecord;
  }

  async updateFee(id: number, updates: Partial<InsertFee>): Promise<Fee | undefined> {
    const [updated] = await db.update(fees).set(updates).where(eq(fees.id, id)).returning();
    return updated;
  }

  async deleteFee(id: number): Promise<boolean> {
    const [deleted] = await db.delete(fees).where(eq(fees.id, id)).returning({ id: fees.id });
    return Boolean(deleted);
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
    const [result] = await db.select({ value: sum(fees.amount) }).from(fees).where(eq(fees.status, "Paid"));
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

  async getAdminDashboardStats() {
    const [totalStudents, totalTeachers, feesCollected, activeClasses, allFees, allAttendance] = await Promise.all([
      this.getTotalStudents(),
      this.getTotalTeachers(),
      this.getFeesCollected(),
      this.getActiveClassesCount(),
      this.getFees(),
      this.getAttendance(),
    ]);

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const publicSettings = await this.getPublicSchoolSettings();
    const locale = publicSettings.financialSettings.locale || "en-US";
    const currencyCode = publicSettings.financialSettings.currencyCode || "USD";
    const monthFormatter = new Intl.DateTimeFormat(locale, { month: "short", timeZone: publicSettings.financialSettings.timezone || "UTC" });
    const dateFormatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: publicSettings.financialSettings.timezone || "UTC",
    });
    const currencyFormatter = new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode, maximumFractionDigits: 0 });

    const monthBuckets = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return { key, month: monthFormatter.format(date), revenue: 0 };
    });

    const monthlyRevenueMap = new Map(monthBuckets.map((bucket) => [bucket.key, bucket]));

    for (const feeRecord of allFees) {
      if (feeRecord.status !== "Paid") continue;
      const feeDate = new Date(feeRecord.dueDate);
      if (Number.isNaN(feeDate.getTime())) continue;
      const key = `${feeDate.getFullYear()}-${String(feeDate.getMonth() + 1).padStart(2, "0")}`;
      const bucket = monthlyRevenueMap.get(key);
      if (bucket) bucket.revenue += feeRecord.amount;
    }

    const recentActivities = [
      ...allFees.map((feeRecord) => {
        const feeDate = new Date(feeRecord.dueDate);
        const studentName = feeRecord.student?.name ?? `Student #${feeRecord.studentId}`;
        return {
          id: `fee-${feeRecord.id}`,
          type: "fee" as const,
          title: feeRecord.status === "Paid" ? "Fee payment recorded" : "Outstanding fee assigned",
          description: `${studentName} has ${feeRecord.status === "Paid" ? "settled" : "an outstanding"} fee of ${currencyFormatter.format(feeRecord.amount)}.`,
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
      outstandingFees: allFees
        .filter((feeRecord) => feeRecord.status === "Unpaid")
        .reduce((total, feeRecord) => total + feeRecord.amount, 0),
      pendingPayments: allFees.filter((feeRecord) => feeRecord.status === "Unpaid").length,
      attendanceMarkedToday: allAttendance.filter((record) => record.date === today).length,
      monthlyRevenue: monthBuckets.map(({ month, revenue }) => ({ month, revenue })),
      recentActivity: recentActivities,
    };
  }
}

export const storage = new DatabaseStorage();