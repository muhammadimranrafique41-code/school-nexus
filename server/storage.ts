import { db } from "./db";
import {
  users, attendance, results, fees,
  type User, type InsertUser,
  type Attendance, type InsertAttendance, type AttendanceWithStudent,
  type Result, type InsertResult, type ResultWithStudent,
  type Fee, type InsertFee, type FeeWithStudent
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  getStudents(): Promise<User[]>;
  getTeachers(): Promise<User[]>;

  // Attendance
  getAttendance(): Promise<AttendanceWithStudent[]>;
  getAttendanceByStudent(studentId: number): Promise<AttendanceWithStudent[]>;
  createAttendance(record: InsertAttendance): Promise<Attendance>;

  // Results
  getResults(): Promise<ResultWithStudent[]>;
  getResultsByStudent(studentId: number): Promise<ResultWithStudent[]>;
  createResult(record: InsertResult): Promise<Result>;

  // Fees
  getFees(): Promise<FeeWithStudent[]>;
  getFeesByStudent(studentId: number): Promise<FeeWithStudent[]>;
  createFee(record: InsertFee): Promise<Fee>;
  updateFee(id: number, updates: Partial<InsertFee>): Promise<Fee>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getStudents(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.role, 'student'));
  }

  async getTeachers(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.role, 'teacher'));
  }

  async getAttendance(): Promise<AttendanceWithStudent[]> {
    const records = await db.select().from(attendance);
    const allUsers = await db.select().from(users);
    
    return records.map(record => ({
      ...record,
      student: allUsers.find(s => s.id === record.studentId)
    }));
  }

  async getAttendanceByStudent(studentId: number): Promise<AttendanceWithStudent[]> {
    const records = await db.select().from(attendance).where(eq(attendance.studentId, studentId));
    const [student] = await db.select().from(users).where(eq(users.id, studentId));
    
    return records.map(record => ({
      ...record,
      student
    }));
  }

  async createAttendance(record: InsertAttendance): Promise<Attendance> {
    const [newRecord] = await db.insert(attendance).values(record).returning();
    return newRecord;
  }

  async getResults(): Promise<ResultWithStudent[]> {
    const allResults = await db.select().from(results);
    const allUsers = await db.select().from(users);
    
    return allResults.map(record => ({
      ...record,
      student: allUsers.find(s => s.id === record.studentId)
    }));
  }

  async getResultsByStudent(studentId: number): Promise<ResultWithStudent[]> {
    const allResults = await db.select().from(results).where(eq(results.studentId, studentId));
    const [student] = await db.select().from(users).where(eq(users.id, studentId));
    
    return allResults.map(record => ({
      ...record,
      student
    }));
  }

  async createResult(record: InsertResult): Promise<Result> {
    const [newRecord] = await db.insert(results).values(record).returning();
    return newRecord;
  }

  async getFees(): Promise<FeeWithStudent[]> {
    const allFees = await db.select().from(fees);
    const allUsers = await db.select().from(users);
    
    return allFees.map(record => ({
      ...record,
      student: allUsers.find(s => s.id === record.studentId)
    }));
  }

  async getFeesByStudent(studentId: number): Promise<FeeWithStudent[]> {
    const allFees = await db.select().from(fees).where(eq(fees.studentId, studentId));
    const [student] = await db.select().from(users).where(eq(users.id, studentId));
    
    return allFees.map(record => ({
      ...record,
      student
    }));
  }

  async createFee(record: InsertFee): Promise<Fee> {
    const [newRecord] = await db.insert(fees).values(record).returning();
    return newRecord;
  }

  async updateFee(id: number, updates: Partial<InsertFee>): Promise<Fee> {
    const [updated] = await db.update(fees).set(updates).where(eq(fees.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();