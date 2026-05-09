# Ledger & Financial Reporting — UI/UX Implementation Plan
## School-Nexus Frontend

> **Scope**: This document is the authoritative design and engineering specification for the Ledger Management and Financial Reporting module UI. It covers visual identity, component architecture, data-fetching strategy, AI integration, and the complete directory layout. All implementation must adhere to the existing patterns established in `client/src/features/examination/` and `client/src/pages/admin/finance.tsx`.

---

## 1. Visual Identity & Design System

### 1.1 Aesthetic Principles

The Ledger module follows the **School-Nexus "Slate-First" design language** already established across the codebase:

| Token | Value | Usage |
|-------|-------|-------|
| Primary surface | `bg-white` / `bg-slate-50` | Card backgrounds |
| Page background | `bg-slate-50` | Layout wrapper |
| Heading text | `text-slate-950` | H1, H2 |
| Body / label text | `text-slate-600` | Descriptions, captions |
| Muted text | `text-slate-400` | Column headers (uppercase, tracked) |
| Accent — income | `text-emerald-600` / `bg-emerald-50` | Positive cash-flow values |
| Accent — expense | `text-rose-600` / `bg-rose-50` | Negative / outflow values |
| Accent — neutral | `text-slate-500` | Net-zero or informational |
| Border | `border-slate-100` | Table rows, card dividers |
| Icon container | `bg-slate-900 text-white rounded-lg` | Page header icon (matches Examination page) |

### 1.2 Page Header Pattern

Every tab/page in the module uses the same header block established in `ExaminationPage.tsx`:

```tsx
<div className="flex items-center gap-3">
  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
    <BookOpen className="h-5 w-5" />
  </div>
  <div>
    <h1 className="text-2xl font-semibold text-slate-950">Ledger</h1>
    <p className="text-sm text-slate-500">
      Unified cash-flow register — income, expenses, and net position.
    </p>
  </div>
</div>
```

### 1.3 Status Badge Extensions

Extend `client/src/components/finance/StatusBadge.tsx` with ledger-specific entry-type badges:

```tsx
// Additional entries in the CONFIG map:
income:  { label: "INCOME",  className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
expense: { label: "EXPENSE", className: "bg-rose-100 text-rose-700 border-rose-200" },
// Fee invoice statuses (already partially present — unify here):
unpaid:         { label: "UNPAID",          className: "bg-amber-100 text-amber-700 border-amber-200" },
partially_paid: { label: "PARTIALLY PAID",  className: "bg-blue-100 text-blue-700 border-blue-200" },
paid:           { label: "PAID",            className: "bg-slate-100 text-slate-500 border-slate-200" },
overdue:        { label: "OVERDUE",         className: "bg-red-100 text-red-700 border-red-200" },
```

---

## 2. Directory Structure

The module lives under `client/src/features/ledger/` following the feature-folder pattern established by `client/src/features/examination/`.

```
client/src/features/ledger/
├── LedgerPage.tsx                    ← Root page (lazy-loaded tabs)
│
├── tabs/
│   ├── CashFlowTab.tsx               ← Monthly income/expense charts + summary cards
│   ├── LedgerRegisterTab.tsx         ← Paginated ledger entry table with filters
│   ├── FeeCollectionTab.tsx          ← Student fee records, status, voucher workflow
│   └── WalletLedgerTab.tsx           ← Family wallet balances + transaction history
│
├── components/
│   ├── CashFlowSummaryCards.tsx      ← KPI cards: total income, expense, net
│   ├── MonthlyRevenueChart.tsx       ← Recharts BarChart (income vs expense by month)
│   ├── CategoryBreakdownChart.tsx    ← Recharts PieChart / RadialBarChart
│   ├── CollectionRateGauge.tsx       ← Recharts RadialBarChart (% collected vs billed)
│   ├── LedgerEntryTable.tsx          ← Reusable data table for ledger rows
│   ├── LedgerEntryRow.tsx            ← Single row with entry-type badge + amount colouring
│   ├── FeeStatusTable.tsx            ← Student fee records with status badges
│   ├── VoucherWorkflowPanel.tsx      ← Generate / view / print voucher workflow
│   ├── AiInsightPanel.tsx            ← AI financial summary surface (see §5)
│   ├── DateRangePicker.tsx           ← Reusable from/to date filter
│   └── ModuleFilterSelect.tsx        ← Source-module dropdown (fees/staff/funds/…)
│
├── hooks/
│   ├── use-ledger.ts                 ← TanStack Query hooks for all ledger endpoints
│   ├── use-cash-flow-summary.ts      ← Dedicated hook for cash_flow_summary view data
│   └── use-ledger-ai-insight.ts      ← Hook that calls /api/ai/chat with finance context
│
└── types.ts                          ← Local TypeScript types (CashFlowRow, LedgerFilter, …)
```

Register the page in `client/src/App.tsx`:
```tsx
const LedgerPage = lazy(() => import("./features/ledger/LedgerPage"));
// Route:
<Route path="/admin/ledger" component={LedgerPage} />
```

Add to `client/src/components/app-sidebar.tsx` under the Finance group:
```tsx
{ href: "/admin/ledger", label: "Ledger", icon: BookOpen }
```

---

## 3. Data Visualisation Components

### 3.1 `MonthlyRevenueChart.tsx`

**Library**: Recharts via the existing `ChartContainer` / `ChartTooltip` wrappers in `client/src/components/ui/chart.tsx`.

**Chart type**: Grouped `BarChart` — two bars per month (income = emerald, expense = rose).

**Data source**: `GET /api/ledger/cash-flow-summary?limit=12` → `CashFlowSummaryRow[]`

```tsx
const chartConfig: ChartConfig = {
  income:  { label: "Income",  color: "hsl(142 71% 45%)" },  // emerald-500
  expense: { label: "Expense", color: "hsl(346 87% 57%)" },  // rose-500
};

// Bar data shape:
type MonthlyBarDatum = {
  label: string;       // "Jan 25", "Feb 25", …
  income: number;
  expense: number;
  net: number;
};
```

**Interactions**:
- Hover tooltip shows `income`, `expense`, and `net` formatted as PKR currency.
- Click on a bar month navigates (or filters) the `LedgerRegisterTab` to that month.

---

### 3.2 `CategoryBreakdownChart.tsx`

**Chart type**: `PieChart` with `Cell` fill per category.

**Data source**: `GET /api/ledger/category-breakdown?from=YYYY-MM-DD&to=YYYY-MM-DD`

**Colour map**:
```ts
const CATEGORY_COLORS: Record<string, string> = {
  fee:     "hsl(142 71% 45%)",  // emerald
  salary:  "hsl(221 83% 53%)",  // blue
  fund:    "hsl(262 83% 58%)",  // violet
  expense: "hsl(346 87% 57%)",  // rose
  other:   "hsl(215 16% 47%)",  // slate
};
```

**Layout**: Rendered inside a `Card` with a legend list on the right showing category name, total amount, and percentage of grand total.

---

### 3.3 `CollectionRateGauge.tsx`

**Chart type**: `RadialBarChart` (single arc, 0–100%).

**Derived metric**:
```
collectionRate = (totalIncome from fees module / totalBilled) × 100
```

`totalBilled` comes from the existing `useFeeBalanceSummary` hook; `totalIncome` from the ledger period summary.

**Colour thresholds**:
- ≥ 90% → emerald
- 70–89% → amber
- < 70% → rose

---

### 3.4 `CashFlowSummaryCards.tsx`

Three `Card` components in a responsive 3-column grid:

| Card | Icon | Value | Colour |
|------|------|-------|--------|
| Total Income | `TrendingUp` | Sum of income entries | `text-emerald-600` |
| Total Expense | `TrendingDown` | Sum of expense entries | `text-rose-600` |
| Net Cash Flow | `Activity` | Income − Expense | Conditional (emerald if positive, rose if negative) |

Each card also shows a sparkline (7-day trend) using a `LineChart` with no axes — purely visual.

---

## 4. Financial Reporting Interface

### 4.1 `LedgerPage.tsx` — Tab Layout

```tsx
<Tabs defaultValue="cashflow">
  <TabsList>
    <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
    <TabsTrigger value="register">Ledger Register</TabsTrigger>
    <TabsTrigger value="fees">Fee Collection</TabsTrigger>
    <TabsTrigger value="wallets">Wallets</TabsTrigger>
  </TabsList>
  <Suspense fallback={<PageSkeleton />}>
    <TabsContent value="cashflow"><CashFlowTab /></TabsContent>
    <TabsContent value="register"><LedgerRegisterTab /></TabsContent>
    <TabsContent value="fees"><FeeCollectionTab /></TabsContent>
    <TabsContent value="wallets"><WalletLedgerTab /></TabsContent>
  </Suspense>
</Tabs>
```

---

### 4.2 `CashFlowTab.tsx`

**Layout** (top-to-bottom):
1. `DateRangePicker` — defaults to current calendar month; presets: "This Month", "Last 3 Months", "This Year".
2. `CashFlowSummaryCards` — three KPI cards.
3. `MonthlyRevenueChart` — full-width bar chart (12 months).
4. Two-column grid: `CategoryBreakdownChart` (left) + `CollectionRateGauge` + `AiInsightPanel` (right).

---

### 4.3 `LedgerRegisterTab.tsx` — Interactive Ledger Table

**Filters** (horizontal toolbar):
- `DateRangePicker` (from / to)
- `ModuleFilterSelect` — "All Modules", "Fees", "Staff", "Funds", "Expenses", "Wallet"
- Entry-type toggle: "All" | "Income" | "Expense"
- Search input (filters `description` client-side)

**Table columns** (`LedgerEntryTable`):

| Column | Width | Notes |
|--------|-------|-------|
| Date | 100px | `transactionDate` formatted as `DD MMM YYYY` |
| Type | 80px | `<EntryTypeBadge>` (income = emerald, expense = rose) |
| Category | 90px | Capitalised category label |
| Module | 90px | Source module chip |
| Description | flex | Truncated with `title` tooltip |
| Reference | 100px | `referenceType #referenceId` as a monospace chip |
| Amount | 100px | Right-aligned, colour-coded by entry type |
| Recorded By | 100px | User name or "System" |

**Pagination**: 25 rows per page using the existing `Pagination` component from `components/ui/pagination.tsx`.

**Export**: "Export CSV" button (top-right) triggers a client-side CSV download using the existing `downloadCsv` utility from `lib/utils.ts`.

---

### 4.4 `FeeCollectionTab.tsx` — Student Fee Records

**Layout**:
1. Summary row: total billed, total collected, total outstanding (from `useFeeBalanceSummary`).
2. Filter bar: class selector, month selector, status filter (`Paid` / `Partially Paid` / `Unpaid` / `Overdue`).
3. `FeeStatusTable` — reuses the existing fee table pattern from `finance.tsx` but scoped to this tab.

**Status indicators** — use the unified `StatusBadge` component:
- `overdue` → red badge + row background `bg-red-50/30`
- `partially_paid` → blue badge
- `paid` → slate badge + row opacity `opacity-60`
- `unpaid` → amber badge

**Row actions** (inline icon buttons):
- `Eye` → opens `StudentStatementPage` in a Sheet (slide-over)
- `ReceiptText` → opens payment receipt print dialog
- `Printer` → triggers `buildInvoicePrintHtml` (existing utility)

**Voucher workflow** (`VoucherWorkflowPanel`):
- Triggered by "Generate Vouchers" button (top-right of tab).
- Opens a `Sheet` (slide-over) containing the existing `BulkVouchersPage` flow:
  1. Class / student selector
  2. Month selector
  3. Preview → Generate → Progress bar (`VoucherGenerationProgress`)
  4. Download / Print / WhatsApp send

---

### 4.5 `WalletLedgerTab.tsx` — Family Wallet Balances

**Layout**:
1. Summary card: total wallet balance across all families.
2. Search input (filter by family / student name).
3. `WalletBalanceTable`:

| Column | Notes |
|--------|-------|
| Family | Family name |
| Students | Comma-separated student names |
| Balance | `numeric(12,2)` formatted as PKR; colour-coded (green if > 0, red if < 0) |
| Last Transaction | Date of most recent `walletTransactions` row |
| Actions | `Eye` → opens `WalletManagementHub` in a Sheet |

4. Clicking a family row expands an inline transaction history (last 10 rows) using a `Collapsible` from `components/ui/collapsible.tsx`.

---

## 5. AI Integration

### 5.1 Architecture

The AI assistant already exists at `client/src/components/ai-assistant-chat.tsx` and calls `POST /api/ai/chat`. The `aiService.ts` server-side already builds a rich financial context (fee totals, overdue counts, wallet balances) that is injected into the system prompt.

**Integration strategy**: Surface AI insights **inline** within the `CashFlowTab` rather than requiring navigation to the standalone AI page.

### 5.2 `AiInsightPanel.tsx`

A `Card` component placed in the right column of `CashFlowTab`:

```
┌─────────────────────────────────────────┐
│  🤖  AI Financial Insight               │
│  ─────────────────────────────────────  │
│  [Skeleton / streamed text]             │
│                                         │
│  "Fee collection for April is at 78%.   │
│   3 classes have >5 overdue invoices.   │
│   Salary expenses are 12% above the     │
│   3-month average."                     │
│                                         │
│  [Refresh]  [Open Full Assistant →]     │
└─────────────────────────────────────────┘
```

**Hook** (`use-ledger-ai-insight.ts`):

```ts
export function useLedgerAiInsight(dateRange: { from: string; to: string }) {
  return useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/ai/chat", {
        message: `Summarise the school's financial position for the period 
                  ${dateRange.from} to ${dateRange.to}. 
                  Focus on: collection rate, overdue invoices, salary expenses, 
                  and net cash flow. Be concise (3–4 bullet points).`,
        history: [],
      }).then((r) => r.json() as Promise<{ answer: string }>),
  });
}
```

**Behaviour**:
- On tab mount, the insight is **not** auto-fetched (avoids unnecessary API calls).
- A "Generate Insight" button triggers the mutation.
- While loading: `Skeleton` placeholder (3 lines).
- On success: streamed markdown rendered via a lightweight `prose` div.
- "Open Full Assistant →" is a `Link` to `/ai-assistant` (existing page).
- The panel is dismissible (X button) and its collapsed state is persisted in `localStorage`.

### 5.3 Contextual Prompt Enrichment

When the user is on `LedgerRegisterTab` and has applied filters (e.g. module = "staff", date range = last month), a "Ask AI about this view" button appears in the filter toolbar. It pre-populates the AI chat with:

```
"Analyse the staff salary expenses for [date range]. 
 Total expense: PKR [X]. Number of payments: [N]. 
 Are there any anomalies compared to previous months?"
```

This is constructed client-side from the current filter state and the aggregated totals already in the query cache.

---

## 6. API Endpoints Required (Backend)

The following REST endpoints must be added to `server/routes.ts` to support the UI hooks:

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/api/ledger/entries` | `ledgerService.getByEntryType` | Paginated ledger register with filters |
| `GET` | `/api/ledger/cash-flow-summary` | `ledgerService.getCashFlowSummary` | Monthly aggregates from the view |
| `GET` | `/api/ledger/period-summary` | `ledgerService.getPeriodSummary` | KPI cards data for a date range |
| `GET` | `/api/ledger/category-breakdown` | `ledgerService.getCategoryBreakdown` | Pie chart data |
| `GET` | `/api/ledger/module-breakdown` | `ledgerService.getModuleBreakdown` | Per-module totals |
| `GET` | `/api/ledger/entries/:id` | `ledgerService.getById` | Single entry detail |

Query parameters for `/api/ledger/entries`:
- `from` (ISO date), `to` (ISO date)
- `entryType` (`income` | `expense`)
- `sourceModule` (enum)
- `page` (default 1), `pageSize` (default 25)

All endpoints are protected by the existing `rbac` middleware with `role: 'admin'`.

---

## 7. Data Fetching & Caching Strategy

### 7.1 Hook Pattern

All hooks follow the established pattern in `client/src/hooks/use-fees.ts`:

```ts
// client/src/features/ledger/hooks/use-ledger.ts

export function useCashFlowSummary(limit = 12) {
  return useQuery({
    queryKey: ["/api/ledger/cash-flow-summary", limit],
    staleTime: 5 * 60 * 1000,   // 5 minutes — financial data changes infrequently
  });
}

export function useLedgerEntries(filters: LedgerFilter) {
  const url = buildLedgerEntriesUrl(filters);
  return useQuery({
    queryKey: [url],
    staleTime: 2 * 60 * 1000,   // 2 minutes
    retry: (count, err) => shouldRetry(count, err),
    retryDelay,
  });
}

export function usePeriodSummary(from: string, to: string) {
  return useQuery({
    queryKey: ["/api/ledger/period-summary", from, to],
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(from && to),
  });
}
```

### 7.2 Cache Invalidation

When a fee payment or salary is recorded (via existing mutations in `use-fees.ts` and `use-staff.ts`), invalidate ledger caches:

```ts
// In useRecordFeePayment mutation's onSuccess:
queryClient.invalidateQueries({ queryKey: ["/api/ledger"] });
```

### 7.3 Stale-Time Rationale

| Data | Stale Time | Reason |
|------|-----------|--------|
| `cash-flow-summary` | 5 min | Aggregated view — expensive to recompute |
| `period-summary` | 5 min | Same |
| `ledger/entries` | 2 min | More granular; users expect near-real-time |
| `category-breakdown` | 5 min | Dashboard widget — acceptable lag |

The global `queryClient` default is `staleTime: Infinity` — all ledger queries **explicitly override** this with shorter stale times since financial data must reflect recent transactions.

---

## 8. Skeleton Loading States

Each component has a dedicated skeleton matching its visual footprint:

```tsx
// CashFlowSummaryCards skeleton:
<div className="grid grid-cols-3 gap-4">
  {[1,2,3].map(i => (
    <Card key={i}><CardContent className="pt-6">
      <Skeleton className="h-4 w-24 mb-2" />
      <Skeleton className="h-8 w-32" />
    </CardContent></Card>
  ))}
</div>

// LedgerEntryTable skeleton:
<div className="space-y-2">
  {Array.from({length: 10}).map((_, i) => (
    <Skeleton key={i} className="h-10 w-full" />
  ))}
</div>
```

---

## 9. Responsive Layout

| Breakpoint | Layout |
|-----------|--------|
| `sm` (< 768px) | Single column; charts stack vertically; table scrolls horizontally |
| `md` (768–1024px) | Two-column grid for KPI cards + charts |
| `lg` (≥ 1024px) | Three-column KPI cards; side-by-side pie + gauge + AI panel |

All tables use `overflow-x-auto` wrappers. Column visibility on mobile:
- Hide "Reference", "Recorded By" columns on `sm`.
- Show all columns on `md+`.

---

## 10. Implementation Sequence

Recommended build order to enable incremental delivery:

| Sprint | Deliverable |
|--------|-------------|
| 1 | Backend API endpoints + `use-ledger.ts` hooks |
| 2 | `LedgerPage.tsx` shell + `LedgerRegisterTab` (table only, no charts) |
| 3 | `CashFlowTab` — KPI cards + `MonthlyRevenueChart` |
| 4 | `CategoryBreakdownChart` + `CollectionRateGauge` |
| 5 | `FeeCollectionTab` + `VoucherWorkflowPanel` integration |
| 6 | `WalletLedgerTab` |
| 7 | `AiInsightPanel` + contextual prompt enrichment |
| 8 | Polish: skeletons, empty states, CSV export, responsive fixes |
