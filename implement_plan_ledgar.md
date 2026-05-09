Implement the Ledger Management Module for the Schooliee platform in the `d:\School-Nexus` workspace. This module must consolidate financial data from `fees`, `staff` (salaries), `funds`, and `expenses` into a unified accounting system.

### 1. Database Schema Implementation (Drizzle ORM)
Instead of raw SQL, define the `ledger` table in `shared/schema.ts` to maintain consistency with the existing project structure. 

**Task:**
1. Update `shared/schema.ts` to include the `ledger` table definition using Drizzle's `pgTable`.
2. Ensure the following fields are mapped correctly:
   - `id`: Serial primary key.
   - `transactionDate`: Timestamp, non-nullable, defaults to `now()`.
   - `entryType`: Varchar(20), constrained to `'income'` or `'expense'`.
   - `category`: Varchar(50), e.g., `'fee'`, `'salary'`, `'fund'`, `'expense'`, `'other'`.
   - `amount`: Decimal(12, 2), non-nullable.
   - `description`: Text, nullable.
   - `referenceType`: Varchar(50), e.g., `'fee_payment'`, `'salary_payment'`.
   - `referenceId`: Integer, nullable (polymorphic ID for source records).
   - `sourceModule`: Varchar(50), e.g., `'fees'`, `'staff'`, `'funds'`, `'expenses'`.
   - `createdBy`: Integer, foreign key referencing `users.id`.
   - `createdAt` / `updatedAt`: Timestamps with default `now()`.

3. Export Zod schemas using `createInsertSchema` and `createSelectSchema` for validation.

```typescript
// Example definition for shared/schema.ts
export const ledger = pgTable("ledger", {
  id: serial("id").primaryKey(),
  transactionDate: timestamp("transaction_date").notNull().defaultNow(),
  entryType: varchar("entry_type", { length: 20 }).notNull(), 
  category: varchar("category", { length: 50 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description"),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: integer("reference_id"),
  sourceModule: varchar("source_module", { length: 50 }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### 2. Migration and Views
1. Generate a new migration file in `server/migrations/` reflecting the new table.
2. Include the `cash_flow_summary` SQL view in the migration to provide monthly aggregates of `total_income`, `total_expense`, and `net_cash_flow`.

### 3. Integration Strategy
- Prepare `server/services/ledgerService.ts` to provide a central `recordTransaction` function.
- This function should be called by `FeeService` and `SalaryService` whenever a payment is confirmed to ensure the ledger remains the "source of truth" for cash flow.