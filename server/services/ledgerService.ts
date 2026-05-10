/**
 * @module LedgerService
 * @description
 * Central accounting service for the Schooliee platform.
 *
 * The `ledger` table is the **single source of truth** for all cash-flow
 * events.  Every confirmed financial transaction — fee receipt, salary
 * disbursement, fund receipt, operational expense — MUST be recorded here
 * via `recordTransaction` before the originating domain operation is
 * considered complete.
 *
 * Design principles:
 *  - **Append-only**: rows are never deleted; corrections are new entries.
 *  - **Idempotency guard**: callers may pass `referenceType` + `referenceId`
 *    to prevent duplicate ledger rows for the same source event.
 *  - **Separation of concerns**: this service owns only ledger I/O; domain
 *    services (FeeService, StaffService, …) own their own tables and call
 *    `ledgerService.recordTransaction` as a side-effect.
 *  - **Type safety**: all public methods are fully typed via the shared
 *    schema types; no `any` escapes.
 */

import { db } from "../db.js";
import { eq, and, desc, gte, lte, sql, asc } from "drizzle-orm";
import {
  ledger,
  type Ledger,
  type RecordTransactionInput,
  type CashFlowSummaryRow,
  type LedgerEntryType,
  type LedgerCategory,
  type LedgerSourceModule,
  type LedgerReferenceType,
} from "../../shared/schema.js";

/**
 * Raw Drizzle insert type for the `ledger` table.
 * Used internally for DB writes; accepts `null` for nullable columns, which
 * avoids the `null` vs `undefined` mismatch that arises from the Zod-inferred
 * `InsertLedger` type (drizzle-zod emits `T | undefined` for optional fields
 * while the underlying Drizzle column type accepts `T | null`).
 */
type LedgerInsertRow = typeof ledger.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalises a monetary value to a fixed-precision decimal string suitable
 * for the `NUMERIC(12,2)` column.  Accepts both `number` and pre-formatted
 * `string` inputs from callers.
 *
 * @throws {Error} if the value is non-positive or not a valid number.
 */
function toDecimalString(amount: number | string): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!isFinite(n) || n <= 0) {
    throw new Error(
      `LedgerService: amount must be a finite positive number, received: ${amount}`
    );
  }
  return n.toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Service class
// ─────────────────────────────────────────────────────────────────────────────

export class LedgerService {
  // ── Write operations ────────────────────────────────────────────────────────

  /**
   * Records a single financial transaction in the unified ledger.
   *
   * This is the **primary write path** for all financial events.  Domain
   * services (FeeService, StaffService, etc.) call this method after
   * successfully persisting their own domain record so that the ledger
   * remains consistent with the source-of-truth tables.
   *
   * Idempotency:
   *   If `referenceType` and `referenceId` are both supplied, the method
   *   checks for an existing row with the same pair before inserting.  If a
   *   duplicate is found, the existing row is returned without a second
   *   insert.  This protects against double-posting caused by retries or
   *   network failures.
   *
   * @param input - Transaction details supplied by the calling domain service.
   * @returns     The newly inserted (or pre-existing duplicate) ledger row.
   * @throws      Re-throws any database error after logging it.
   */
  async recordTransaction(input: RecordTransactionInput): Promise<Ledger> {
    // ── Idempotency check ──────────────────────────────────────────────────
    if (input.referenceType && input.referenceId !== undefined) {
      const [existing] = await db
        .select()
        .from(ledger)
        .where(
          and(
            eq(ledger.referenceType, input.referenceType),
            eq(ledger.referenceId, input.referenceId)
          )
        )
        .limit(1);

      if (existing) {
        // Idempotent: return the pre-existing row without a second insert.
        return existing;
      }
    }

    // ── Resolve effective transaction date ─────────────────────────────────
    // `effectiveDate` allows callers (e.g. payroll backdating) to record a
    // transaction against a historical date without altering the system clock.
    // When supplied it takes precedence over `transactionDate`; both fall back
    // to `new Date()` (i.e. "now") when absent.
    //
    // Validation: backdated entries are permitted but future-dated entries are
    // rejected to prevent accidental pre-posting of unconfirmed transactions.
    const resolvedDate: Date = (() => {
      const candidate = input.effectiveDate
        ? new Date(input.effectiveDate)
        : input.transactionDate
          ? new Date(input.transactionDate)
          : new Date();

      if (isNaN(candidate.getTime())) {
        throw new Error(
          `LedgerService: effectiveDate / transactionDate is not a valid date: ` +
            String(input.effectiveDate ?? input.transactionDate)
        );
      }

      // Reject future-dated entries (allow up to 1 minute of clock skew).
      const oneMinuteFromNow = new Date(Date.now() + 60_000);
      if (candidate > oneMinuteFromNow) {
        throw new Error(
          `LedgerService: future-dated ledger entries are not permitted. ` +
            `Supplied date: ${candidate.toISOString()}`
        );
      }

      return candidate;
    })();

    // ── Build the insert payload ───────────────────────────────────────────
    // Use the raw Drizzle insert type (`LedgerInsertRow`) rather than the
    // Zod-inferred `InsertLedger` so that nullable columns correctly accept
    // `null` without TypeScript narrowing conflicts.
    const payload: LedgerInsertRow = {
      transactionDate: resolvedDate,
      entryType: input.entryType,
      category: input.category,
      amount: toDecimalString(input.amount),
      description: input.description ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      sourceModule: input.sourceModule ?? null,
      createdBy: input.createdBy ?? null,
    };

    try {
      const [row] = await db.insert(ledger).values(payload).returning();
      return row;
    } catch (err) {
      // Surface a descriptive error so callers can log the full context.
      throw new Error(
        `LedgerService.recordTransaction failed for ` +
          `${input.referenceType ?? "manual"}#${input.referenceId ?? "N/A"}: ` +
          String(err)
      );
    }
  }

  /**
   * Records multiple transactions atomically within a single database
   * transaction.  Use this when a single business event produces more than
   * one ledger entry (e.g. a partial payment that splits across categories).
   *
   * @param inputs  - Array of transaction inputs.
   * @param txClient - Optional Drizzle transaction client; if omitted a new
   *                   transaction is started internally.
   * @returns Array of inserted ledger rows in the same order as `inputs`.
   */
  async recordTransactionBatch(
    inputs: RecordTransactionInput[]
  ): Promise<Ledger[]> {
    if (inputs.length === 0) return [];

    return db.transaction(async (tx) => {
      const results: Ledger[] = [];

      for (const input of inputs) {
        const payload: LedgerInsertRow = {
          transactionDate: input.transactionDate ?? new Date(),
          entryType: input.entryType,
          category: input.category,
          amount: toDecimalString(input.amount),
          description: input.description ?? null,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          sourceModule: input.sourceModule ?? null,
          createdBy: input.createdBy ?? null,
        };

        const [row] = await tx.insert(ledger).values(payload).returning();
        results.push(row);
      }

      return results;
    });
  }

  // ── Read operations ─────────────────────────────────────────────────────────

  /**
   * Retrieves a single ledger entry by its surrogate primary key.
   *
   * @param id - Ledger row ID.
   * @returns  The ledger row, or `undefined` if not found.
   */
  async getById(id: number): Promise<Ledger | undefined> {
    const [row] = await db
      .select()
      .from(ledger)
      .where(eq(ledger.id, id))
      .limit(1);
    return row;
  }

  /**
   * Returns all ledger entries that back-reference a specific source record.
   *
   * Example: find all ledger rows created by fee_payment #42:
   * ```ts
   * ledgerService.getByReference("fee_payment", 42)
   * ```
   *
   * @param referenceType - Discriminator string (e.g. `'fee_payment'`).
   * @param referenceId   - PK of the originating domain record.
   */
  async getByReference(
    referenceType: LedgerReferenceType,
    referenceId: number
  ): Promise<Ledger[]> {
    return db
      .select()
      .from(ledger)
      .where(
        and(
          eq(ledger.referenceType, referenceType),
          eq(ledger.referenceId, referenceId)
        )
      )
      .orderBy(asc(ledger.transactionDate));
  }

  /**
   * Returns all ledger entries produced by a specific sub-system module.
   *
   * @param sourceModule - e.g. `'fees'`, `'staff'`, `'funds'`.
   * @param limit        - Maximum rows to return (default: 200).
   */
  async getBySourceModule(
    sourceModule: LedgerSourceModule,
    limit = 200
  ): Promise<Ledger[]> {
    return db
      .select()
      .from(ledger)
      .where(eq(ledger.sourceModule, sourceModule))
      .orderBy(desc(ledger.transactionDate))
      .limit(limit);
  }

  /**
   * Returns ledger entries filtered by entry type and an optional date range.
   *
   * @param entryType - `'income'` or `'expense'`.
   * @param from      - Inclusive start date (ISO 8601 string or Date).
   * @param to        - Inclusive end date   (ISO 8601 string or Date).
   * @param limit     - Maximum rows to return (default: 500).
   */
  async getByEntryType(
    entryType: LedgerEntryType,
    from?: Date | string,
    to?: Date | string,
    limit = 500
  ): Promise<Ledger[]> {
    const conditions = [eq(ledger.entryType, entryType)];

    if (from) {
      conditions.push(gte(ledger.transactionDate, new Date(from)));
    }
    if (to) {
      conditions.push(lte(ledger.transactionDate, new Date(to)));
    }

    return db
      .select()
      .from(ledger)
      .where(and(...conditions))
      .orderBy(desc(ledger.transactionDate))
      .limit(limit);
  }

  /**
   * Returns all ledger entries within a calendar month.
   *
   * @param year  - Four-digit calendar year (e.g. 2025).
   * @param month - Calendar month, 1-indexed (1 = January, 12 = December).
   * @param limit - Maximum rows to return (default: 1000).
   */
  async getByMonth(
    year: number,
    month: number,
    limit = 1000
  ): Promise<Ledger[]> {
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59, 999); // last ms of last day

    return db
      .select()
      .from(ledger)
      .where(
        and(
          gte(ledger.transactionDate, from),
          lte(ledger.transactionDate, to)
        )
      )
      .orderBy(asc(ledger.transactionDate))
      .limit(limit);
  }

  // ── Aggregation / reporting ─────────────────────────────────────────────────

  /**
   * Computes the total income and total expense for a given date range,
   * then derives the net cash flow.
   *
   * This is the programmatic equivalent of querying the `cash_flow_summary`
   * view for a specific period.
   *
   * @param from - Inclusive start date.
   * @param to   - Inclusive end date.
   * @returns    `{ totalIncome, totalExpense, netCashFlow }` as numeric strings.
   */
  async getPeriodSummary(
    from: Date | string,
    to: Date | string
  ): Promise<{ totalIncome: string; totalExpense: string; netCashFlow: string }> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const [result] = await db
      .select({
        totalIncome: sql<string>`
          COALESCE(
            SUM(${ledger.amount}) FILTER (WHERE ${ledger.entryType} = 'income'),
            0
          )::numeric(14,2)`,
        totalExpense: sql<string>`
          COALESCE(
            SUM(${ledger.amount}) FILTER (WHERE ${ledger.entryType} = 'expense'),
            0
          )::numeric(14,2)`,
      })
      .from(ledger)
      .where(
        and(
          gte(ledger.transactionDate, fromDate),
          lte(ledger.transactionDate, toDate)
        )
      );

    const income = parseFloat(result?.totalIncome ?? "0");
    const expense = parseFloat(result?.totalExpense ?? "0");

    return {
      totalIncome: income.toFixed(2),
      totalExpense: expense.toFixed(2),
      netCashFlow: (income - expense).toFixed(2),
    };
  }

  /**
   * Returns the monthly cash-flow summary aggregated directly from the `ledger`
   * table using Drizzle ORM.  This avoids a dependency on the `cash_flow_summary`
   * PostgreSQL view so the endpoint works even before the view is created.
   *
   * Results are ordered newest-month-first and capped at `limit` rows.
   *
   * @param limit - Maximum number of months to return (default: 24).
   * @returns     Array of `CashFlowSummaryRow` objects.
   */
  async getCashFlowSummary(limit = 24): Promise<CashFlowSummaryRow[]> {
    const rows = await db
      .select({
        year:         sql<string>`EXTRACT(YEAR  FROM ${ledger.transactionDate})::integer`,
        month:        sql<string>`EXTRACT(MONTH FROM ${ledger.transactionDate})::integer`,
        totalIncome:  sql<string>`COALESCE(SUM(${ledger.amount}) FILTER (WHERE ${ledger.entryType} = 'income'),  0)::numeric(14,2)`,
        totalExpense: sql<string>`COALESCE(SUM(${ledger.amount}) FILTER (WHERE ${ledger.entryType} = 'expense'), 0)::numeric(14,2)`,
        netCashFlow:  sql<string>`(COALESCE(SUM(${ledger.amount}) FILTER (WHERE ${ledger.entryType} = 'income'),  0) - COALESCE(SUM(${ledger.amount}) FILTER (WHERE ${ledger.entryType} = 'expense'), 0))::numeric(14,2)`,
      })
      .from(ledger)
      .groupBy(
        sql`EXTRACT(YEAR  FROM ${ledger.transactionDate})`,
        sql`EXTRACT(MONTH FROM ${ledger.transactionDate})`,
      )
      .orderBy(
        desc(sql`EXTRACT(YEAR  FROM ${ledger.transactionDate})`),
        desc(sql`EXTRACT(MONTH FROM ${ledger.transactionDate})`),
      )
      .limit(limit);

    return rows.map((r) => ({
      year:         parseInt(String(r.year),  10),
      month:        parseInt(String(r.month), 10),
      totalIncome:  String(r.totalIncome),
      totalExpense: String(r.totalExpense),
      netCashFlow:  String(r.netCashFlow),
    }));
  }

  /**
   * Returns per-category totals for a given date range.
   * Useful for the finance dashboard's category breakdown widget.
   *
   * @param from - Inclusive start date.
   * @param to   - Inclusive end date.
   * @returns    Array of `{ category, entryType, total }` rows.
   */
  async getCategoryBreakdown(
    from: Date | string,
    to: Date | string
  ): Promise<Array<{ category: LedgerCategory; entryType: LedgerEntryType; total: string }>> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const rows = await db
      .select({
        category: ledger.category,
        entryType: ledger.entryType,
        total: sql<string>`SUM(${ledger.amount})::numeric(14,2)`,
      })
      .from(ledger)
      .where(
        and(
          gte(ledger.transactionDate, fromDate),
          lte(ledger.transactionDate, toDate)
        )
      )
      .groupBy(ledger.category, ledger.entryType)
      .orderBy(desc(sql`SUM(${ledger.amount})`));

    return rows as Array<{
      category: LedgerCategory;
      entryType: LedgerEntryType;
      total: string;
    }>;
  }

  /**
   * Returns per-source-module totals for a given date range.
   * Useful for identifying which sub-system contributes most to cash flow.
   *
   * @param from - Inclusive start date.
   * @param to   - Inclusive end date.
   */
  async getModuleBreakdown(
    from: Date | string,
    to: Date | string
  ): Promise<Array<{ sourceModule: LedgerSourceModule | null; entryType: LedgerEntryType; total: string }>> {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    const rows = await db
      .select({
        sourceModule: ledger.sourceModule,
        entryType: ledger.entryType,
        total: sql<string>`SUM(${ledger.amount})::numeric(14,2)`,
      })
      .from(ledger)
      .where(
        and(
          gte(ledger.transactionDate, fromDate),
          lte(ledger.transactionDate, toDate)
        )
      )
      .groupBy(ledger.sourceModule, ledger.entryType)
      .orderBy(desc(sql`SUM(${ledger.amount})`));

    return rows as Array<{
      sourceModule: LedgerSourceModule | null;
      entryType: LedgerEntryType;
      total: string;
    }>;
  }

  // ── Audit / reconciliation helpers ──────────────────────────────────────────

  /**
   * Counts the total number of ledger entries, optionally filtered by module.
   * Useful for health-check endpoints and admin dashboards.
   *
   * @param sourceModule - Optional filter.
   */
  async countEntries(sourceModule?: LedgerSourceModule): Promise<number> {
    const conditions = sourceModule
      ? [eq(ledger.sourceModule, sourceModule)]
      : [];

    const [result] = await db
      .select({ count: sql<string>`COUNT(*)` })
      .from(ledger)
      .where(conditions.length ? and(...conditions) : undefined);

    return parseInt(result?.count ?? "0", 10);
  }

  /**
   * Verifies that a specific source record has a corresponding ledger entry.
   * Returns `true` if at least one matching row exists; `false` otherwise.
   *
   * Use this in reconciliation scripts to detect missing ledger postings.
   *
   * @param referenceType - e.g. `'fee_payment'`.
   * @param referenceId   - PK of the source record.
   */
  async hasEntry(
    referenceType: LedgerReferenceType,
    referenceId: number
  ): Promise<boolean> {
    const [row] = await db
      .select({ id: ledger.id })
      .from(ledger)
      .where(
        and(
          eq(ledger.referenceType, referenceType),
          eq(ledger.referenceId, referenceId)
        )
      )
      .limit(1);

    return row !== undefined;
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

/**
 * Pre-instantiated singleton.  Import this in domain services:
 * ```ts
 * import { ledgerService } from "./ledgerService.js";
 * ```
 */
export const ledgerService = new LedgerService();
