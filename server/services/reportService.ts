import PDFDocument from "pdfkit";
import { PassThrough } from "stream";
import { storage } from "../storage.ts";
import { db } from "../db.ts";
import { eq, and, gte, lte, sql, count, inArray, desc } from "drizzle-orm";
import {
  users,
  fees,
  feePayments,
  expenses,
  attendance,
  results,
  reportDefinitions,
  reportHistory,
  reportCache,
  type InsertReportDefinition,
  type InsertReportHistory,
  type InsertReportCache,
  type ReportDefinition,
  type ReportHistory,
  type ReportCache,
  type User,
} from "../../shared/schema.js";
import { resolveScope, type ScopedAccess } from "./aiService.js";

// ── Financial Dashboard Report Interfaces ──────────────────────────

export interface MonthlyFeeSummaryRow {
  month: string;
  totalBilled: number;
  totalCollected: number;
  totalOutstanding: number;
}

export interface MonthlyFundSummaryRow {
  month: string;
  fundType: string;
  collected: number;
}

export interface MonthlyPnLRow {
  month: string;
  totalRevenue: number;
  totalExpenditure: number;
  netProfit: number;
}

export interface OverdueFeeEntry {
  studentId: number;
  name: string;
  className: string;
  totalPastDue: number;
}

export interface DailyFeeCollectionRow {
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  studentReference: string;
}

type ReportCategory = "academic" | "fee" | "finance" | "attendance";
type GenerateReportInput = {
  definitionId: number;
  parameters: Record<string, unknown>;
  generatedBy: number;
};

export class ReportService {
  // ── Definition CRUD ──────────────────────────────────────────

  async getDefinitions(): Promise<ReportDefinition[]> {
    return storage.getReportDefinitions();
  }

  async getDefinition(id: number): Promise<ReportDefinition | undefined> {
    return storage.getReportDefinition(id);
  }

  async createDefinition(
    record: InsertReportDefinition
  ): Promise<ReportDefinition> {
    return storage.createReportDefinition(record);
  }

  async updateDefinition(
    id: number,
    updates: Partial<InsertReportDefinition>
  ): Promise<ReportDefinition | undefined> {
    return storage.updateReportDefinition(id, updates);
  }

  async deleteDefinition(id: number): Promise<boolean> {
    return storage.deleteReportDefinition(id);
  }

  // ── History ──────────────────────────────────────────────────

  async getHistory(): Promise<ReportHistory[]> {
    return storage.getReportHistory();
  }

  async getHistoryByDefinition(
    definitionId: number
  ): Promise<ReportHistory[]> {
    return storage.getReportHistoryByDefinition(definitionId);
  }

  async recordGeneration(record: InsertReportHistory): Promise<ReportHistory> {
    return storage.createReportHistory(record);
  }

  async incrementDownload(id: number): Promise<ReportHistory | undefined> {
    return storage.incrementReportDownloadCount(id);
  }

  // ── Cache ────────────────────────────────────────────────────

  async getCached(
    reportKey: string
  ): Promise<ReportCache | undefined> {
    return storage.getReportCache(reportKey);
  }

  async setCache(record: InsertReportCache): Promise<ReportCache> {
    return storage.setReportCache(record);
  }

  async cleanExpiredCache(): Promise<number> {
    return storage.deleteExpiredReportCache();
  }

  // ── Data Aggregation ─────────────────────────────────────────

  private async aggregateAcademicData(
    params: Record<string, unknown>
  ): Promise<unknown[]> {
    const classFilter = params.className as string | undefined;
    const examFilter = params.examTitle as string | undefined;
    const dateFrom = params.dateFrom as string | undefined;
    const dateTo = params.dateTo as string | undefined;

    const conditions = [];
    if (dateFrom) conditions.push(gte(results.examDate, dateFrom));
    if (dateTo) conditions.push(lte(results.examDate, dateTo));
    if (examFilter) conditions.push(eq(results.examTitle, examFilter));

    const rows = await db
      .select({
        studentId: results.studentId,
        studentName: users.name,
        className: users.className,
        subject: results.subject,
        marks: results.marks,
        grade: results.grade,
        totalMarks: results.totalMarks,
        examTitle: results.examTitle,
        examDate: results.examDate,
      })
      .from(results)
      .innerJoin(users, eq(results.studentId, users.id))
      .where(
        classFilter
          ? and(eq(users.className, classFilter), ...conditions)
          : and(...conditions)
      )
      .orderBy(users.className, users.name, results.examDate);

    return rows;
  }

  private async aggregateFeeData(
    params: Record<string, unknown>
  ): Promise<unknown[]> {
    const classFilter = params.className as string | undefined;
    const monthFilter = params.month as string | undefined;
    const statusFilter = params.status as string | undefined;

    const conditions = [];
    if (monthFilter) conditions.push(eq(fees.billingMonth, monthFilter));
    if (statusFilter) conditions.push(eq(fees.status, statusFilter));

    const rows = await db
      .select({
        studentId: fees.studentId,
        studentName: users.name,
        className: users.className,
        amount: fees.amount,
        paidAmount: fees.paidAmount,
        remainingBalance: fees.remainingBalance,
        dueDate: fees.dueDate,
        status: fees.status,
        billingMonth: fees.billingMonth,
      })
      .from(fees)
      .innerJoin(users, eq(fees.studentId, users.id))
      .where(
        classFilter
          ? and(eq(users.className, classFilter), ...conditions)
          : and(...conditions)
      )
      .orderBy(users.className, users.name, fees.dueDate);

    return rows;
  }

  private async aggregateFinanceData(
    params: Record<string, unknown>
  ): Promise<unknown[]> {
    const monthFilter = params.month as string | undefined;
    const classFilter = params.className as string | undefined;

    const conditions = [];
    if (monthFilter) conditions.push(eq(fees.billingMonth, monthFilter));

    const feeRows = await db
      .select({
        studentId: fees.studentId,
        studentName: users.name,
        className: users.className,
        amount: fees.amount,
        paidAmount: fees.paidAmount,
        remainingBalance: fees.remainingBalance,
        status: fees.status,
        billingMonth: fees.billingMonth,
      })
      .from(fees)
      .innerJoin(users, eq(fees.studentId, users.id))
      .where(
        classFilter
          ? and(eq(users.className, classFilter), ...conditions)
          : and(...conditions)
      );

    const totalBilled = (feeRows as { amount: number }[]).reduce(
      (s, r) => s + r.amount,
      0
    );
    const totalPaid = (feeRows as { paidAmount: number }[]).reduce(
      (s, r) => s + r.paidAmount,
      0
    );

    return [
      {
        totalStudents: await db
          .select({ value: count() })
          .from(users)
          .where(eq(users.role, "student"))
          .then((r) => Number(r[0].value)),
        totalBilled,
        totalPaid,
        totalOutstanding: totalBilled - totalPaid,
        collectionRate:
          totalBilled > 0
            ? Math.round((totalPaid / totalBilled) * 100)
            : 0,
      },
    ];
  }

  private async aggregateAttendanceData(
    params: Record<string, unknown>
  ): Promise<unknown[]> {
    const classFilter = params.className as string | undefined;
    const dateFrom = params.dateFrom as string | undefined;
    const dateTo = params.dateTo as string | undefined;

    const conditions = [];
    if (dateFrom) conditions.push(gte(attendance.date, dateFrom));
    if (dateTo) conditions.push(lte(attendance.date, dateTo));
    if (classFilter)
      conditions.push(eq(users.className, classFilter));

    const rows = await db
      .select({
        studentId: attendance.studentId,
        studentName: users.name,
        className: users.className,
        date: attendance.date,
        status: attendance.status,
        session: attendance.session,
        remarks: attendance.remarks,
      })
      .from(attendance)
      .innerJoin(users, eq(attendance.studentId, users.id))
      .where(and(...conditions))
      .orderBy(users.className, users.name, attendance.date);

    return rows;
  }

  // ── Report Generation ─────────────────────────────────────────

  async generateReport(input: GenerateReportInput): Promise<{
    pdfBuffer: Buffer;
    history: ReportHistory;
  }> {
    const definition = await storage.getReportDefinition(
      input.definitionId
    );
    if (!definition) throw new Error("Report definition not found");

    let data: unknown[];
    switch (definition.category as ReportCategory) {
      case "academic":
        data = await this.aggregateAcademicData(input.parameters);
        break;
      case "fee":
        data = await this.aggregateFeeData(input.parameters);
        break;
      case "finance":
        data = await this.aggregateFinanceData(input.parameters);
        break;
      case "attendance":
        data = await this.aggregateAttendanceData(input.parameters);
        break;
      default:
        throw new Error(`Unknown report category: ${definition.category}`);
    }

    const pdfBuffer = await this.renderPdf(definition, data);

    const history = await storage.createReportHistory({
      reportDefinitionId: definition.id,
      generatedBy: input.generatedBy,
      parametersUsed: input.parameters,
      fileUrl: null,
      fileSize: pdfBuffer.length,
    });

    return { pdfBuffer, history };
  }

  private async renderPdf(
    definition: ReportDefinition,
    data: unknown[]
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const bufferChunks: Buffer[] = [];

      const stream = new PassThrough();
      stream.on("data", (chunk: Buffer) => bufferChunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(bufferChunks)));
      stream.on("error", reject);

      doc.pipe(stream);

      doc
        .fontSize(18)
        .text(definition.name, { align: "center" });
      doc.moveDown();

      if (definition.description) {
        doc.fontSize(10).text(definition.description, { align: "center" });
        doc.moveDown();
      }

      doc
        .fontSize(8)
        .text(
          `Generated: ${new Date().toLocaleString()}`,
          { align: "right" }
        );
      doc.moveDown();

      const categoryLabel =
        {
          academic: "Academic Report",
          fee: "Fee Report",
          finance: "Finance Report",
          attendance: "Attendance Report",
        }[definition.category as ReportCategory] ?? definition.category;

      doc.fontSize(12).text(`Category: ${categoryLabel}`);
      doc.moveDown(1.5);

      if (data.length === 0) {
        doc.fontSize(11).text("No data available for the selected criteria.", { align: "center" });
      } else {
        const first = data[0] as Record<string, unknown>;
        const keys = Object.keys(first);
        const columnCount = keys.length;
        const pageWidth = doc.page.width - 100;
        const colWidth = Math.max(60, Math.floor(pageWidth / columnCount));

        const headers = keys.map((k) =>
          k
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (s) => s.toUpperCase())
            .replace(/Id$/, " ID")
        );

        let y = doc.y;
        doc.fontSize(8).font("Helvetica-Bold");
        headers.forEach((h, i) => {
          doc.text(h, 50 + i * colWidth, y, {
            width: colWidth,
            align: "left",
          });
        });
        doc.moveDown(0.3);
        y = doc.y;

        doc.font("Helvetica").fontSize(7);
        for (const row of data) {
          const values = row as Record<string, unknown>;
          if (y > doc.page.height - 50) {
            doc.addPage();
            y = doc.y;
            doc.font("Helvetica-Bold").fontSize(8);
            headers.forEach((h, i) => {
              doc.text(h, 50 + i * colWidth, y, {
                width: colWidth,
                align: "left",
              });
            });
            doc.moveDown(0.3);
            y = doc.y;
            doc.font("Helvetica").fontSize(7);
          }

          keys.forEach((key, i) => {
            const val = values[key];
            doc.text(
              val != null ? String(val) : "-",
              50 + i * colWidth,
              y,
              { width: colWidth, align: "left" }
            );
          });
          y += 14;
        }
      }

      doc.end();
    });
  }

  // ── Financial Dashboard Reports ──────────────────────────────────

  async getMonthlyFeeSummary(user: User): Promise<MonthlyFeeSummaryRow[]> {
    const scope = await resolveScope(user);

    const conditions = [];
    if (scope.role === "teacher" && scope.classNames.length > 0) {
      conditions.push(inArray(users.className, scope.classNames));
    }

    const rows = await db
      .select({
        month: fees.billingMonth,
        totalBilled: sql<number>`COALESCE(SUM(${fees.amount}), 0)::int`,
        totalCollected: sql<number>`COALESCE(SUM(${fees.paidAmount}), 0)::int`,
        totalOutstanding: sql<number>`COALESCE(SUM(${fees.remainingBalance}), 0)::int`,
      })
      .from(fees)
      .innerJoin(users, eq(fees.studentId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(fees.billingMonth)
      .orderBy(fees.billingMonth);

    return rows as unknown as MonthlyFeeSummaryRow[];
  }

  async getMonthlyFundsSummary(user: User): Promise<MonthlyFundSummaryRow[]> {
    const scope = await resolveScope(user);

    const conditions = [];
    if (scope.role === "teacher" && scope.classNames.length > 0) {
      conditions.push(inArray(users.className, scope.classNames));
    }

    const rows = await db
      .select({
        month: fees.billingMonth,
        fundType: fees.feeType,
        collected: sql<number>`COALESCE(SUM(${fees.paidAmount}), 0)::int`,
      })
      .from(fees)
      .innerJoin(users, eq(fees.studentId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(fees.billingMonth, fees.feeType)
      .orderBy(fees.billingMonth, fees.feeType);

    return rows as unknown as MonthlyFundSummaryRow[];
  }

  async getMonthlyPnL(user: User): Promise<MonthlyPnLRow[]> {
    const scope = await resolveScope(user);

    const feeConditions = [];
    if (scope.role === "teacher" && scope.classNames.length > 0) {
      feeConditions.push(inArray(users.className, scope.classNames));
    }

    const revenueRows = await db
      .select({
        month: fees.billingMonth,
        totalRevenue: sql<number>`COALESCE(SUM(${fees.paidAmount}), 0)::int`,
      })
      .from(fees)
      .innerJoin(users, eq(fees.studentId, users.id))
      .where(feeConditions.length > 0 ? and(...feeConditions) : undefined)
      .groupBy(fees.billingMonth);

    const expenseRows = await db
      .select({
        month: sql<string>`TO_CHAR(${expenses.expenseDate}, 'YYYY-MM')`,
        totalExpenditure: sql<number>`COALESCE(SUM(CAST(${expenses.amount} AS integer)), 0)`,
      })
      .from(expenses)
      .groupBy(sql`TO_CHAR(${expenses.expenseDate}, 'YYYY-MM')`);

    const revenueMap = new Map<string, number>();
    for (const r of revenueRows) {
      revenueMap.set(r.month, Number(r.totalRevenue));
    }
    const expenseMap = new Map<string, number>();
    for (const r of expenseRows) {
      expenseMap.set(r.month, Number(r.totalExpenditure));
    }

    const allMonths = new Set([...revenueMap.keys(), ...expenseMap.keys()]);
    return Array.from(allMonths)
      .sort()
      .map((month) => {
        const totalRevenue = revenueMap.get(month) ?? 0;
        const totalExpenditure = expenseMap.get(month) ?? 0;
        return { month, totalRevenue, totalExpenditure, netProfit: totalRevenue - totalExpenditure };
      });
  }

  async getOverdueFeesSnapshot(user: User): Promise<OverdueFeeEntry[]> {
    const scope = await resolveScope(user);

    const conditions = [
      eq(fees.status, "Overdue"),
      sql`${fees.remainingBalance} > 0`,
    ];
    if (scope.role === "teacher" && scope.classNames.length > 0) {
      conditions.push(inArray(users.className, scope.classNames));
    }

    const rows = await db
      .select({
        studentId: fees.studentId,
        name: users.name,
        className: users.className,
        totalPastDue: sql<number>`COALESCE(SUM(${fees.remainingBalance}), 0)::int`,
      })
      .from(fees)
      .innerJoin(users, eq(fees.studentId, users.id))
      .where(and(...conditions))
      .groupBy(fees.studentId, users.name, users.className)
      .orderBy(sql`SUM(${fees.remainingBalance}) DESC`);

    return rows as unknown as OverdueFeeEntry[];
  }

  async getDailyFeeCollectionReport(user: User): Promise<DailyFeeCollectionRow[]> {
    const scope = await resolveScope(user);

    const conditions = [];
    if (scope.role === "teacher" && scope.classNames.length > 0) {
      conditions.push(inArray(users.className, scope.classNames));
    }

    const rows = await db
      .select({
        paymentDate: feePayments.paymentDate,
        amount: feePayments.amount,
        paymentMethod: feePayments.method,
        studentReference: sql<string>`COALESCE(${users.name} || ' (' || ${users.rollNumber} || ')', ${users.name})`,
      })
      .from(feePayments)
      .innerJoin(users, eq(feePayments.studentId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(feePayments.paymentDate), desc(feePayments.id));

    return rows as unknown as DailyFeeCollectionRow[];
  }

  async generateReportKey(
    definitionId: number,
    params: Record<string, unknown>
  ): Promise<string> {
    const sorted = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    return `${definitionId}:${sorted}`;
  }
}

export const reportService = new ReportService();
