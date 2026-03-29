Resume this session with:
claude --resume 53254e16-06c6-4805-a42a-309a762171a0
You are a principal full-stack engineer on a Node.js/Express + React/TypeScript
school fee management system. Build a complete Consolidated Fee Voucher System
with a multi-month selector UI, smart student due detection, and a
professional printable voucher. No QR codes. No FamilyID field.

===================================================================
## FEATURE OVERVIEW
===================================================================

Three interconnected modules:

  MODULE 1 — Month Selector UI
    Admin selects one or more billing months to include in the voucher batch

  MODULE 2 — Student Due Detection
    System automatically flags students who have unpaid fees in any
    of the selected months OR have a previous outstanding balance

  MODULE 3 — Consolidated Voucher
    Single voucher per student showing:
    Previous unpaid dues + Selected month fees + Summary block

===================================================================
## MODULE 1 — MULTI-MONTH SELECTOR UI
===================================================================

Route: /fees/vouchers/generate (step 1 of 2)

### Layout

Header:
  Title: "Select Months"
  Subtitle: "Check months to include in this batch."
  Top-right controls:
    [ All Year: 2026 ▾ ]  [ All ]  [ None ]

Table (one row per month):

  ┌─────────────────────┬──────────────────┬────────┐
  │ MONTH               │ YEAR             │ PRINT  │
  ├─────────────────────┼──────────────────┼────────┤
  │ January        ▾    │ 2026        ▾    │  ☐     │
  │ February       ▾    │ 2026        ▾    │  ☐     │
  │ ...                 │ ...              │  ...   │
  │ December       ▾    │ 2026        ▾    │  ☑ ◀  │ ← selected row highlighted
  └─────────────────────┴──────────────────┴────────┘

Footer bar:
  Left:  "X month(s) selected" (blue badge, e.g. "1 month selected")
  Right: Selected month chips e.g. [ Dec 2026 × ] [ Jan 2027 × ]
         [ → Preview Students ] button (primary, disabled if 0 selected)

### Behavior

- Selecting PRINT checkbox highlights that row with a light blue background
- Month dropdown: Jan–Dec
- Year dropdown: current year ± 2 (e.g. 2024–2028)
- Each row month+year combination is independent
- [ All ] selects all 12 PRINT checkboxes
- [ None ] deselects all
- "All Year" dropdown changes all year dropdowns at once
- Duplicate month+year combinations show inline error:
  "Duplicate: March 2026 already added"
- [ → Preview Students ] navigates to Module 2 passing selected months

### State Shape

  selectedMonths: [
    { id: uuid, month: "January", year: 2026, billingMonth: "2026-01" }
  ]

===================================================================
## MODULE 2 — STUDENT DUE DETECTION SCREEN
===================================================================

Route: /fees/vouchers/generate/preview

### Purpose

After month selection, show exactly which students will be included
in the batch and WHY — highlighting those with previous unpaid dues.

### Layout

Header:
  "Student Preview — X students found"
  Subtitle: "Showing students with fees due in selected months
             or with outstanding previous balance."
  Filters bar:
    [ Class ▾ ] [ Status: All ▾ ] [ 🔍 Search by name/ID ]
    Right: [ ← Back ] [ Generate Vouchers → ]

### Student Cards / Table

Each row shows:

  ┌──────┬────────────────┬─────────┬──────────┬───────────────┬──────────┬──────────┐
  │  ID  │ Student Name   │  Class  │ Prev Due │ Current Month │  Total   │  Status  │
  ├──────┼────────────────┼─────────┼──────────┼───────────────┼──────────┼──────────┤
  │  283 │ Rehan          │ 10th A  │ ⚠ 2800  │     2400      │   5200   │ OVERDUE  │
  │   40 │ Imran Rafique  │ Grade-1 │    0     │     1400      │   1400   │ CURRENT  │
  └──────┴────────────────┴─────────┴──────────┴───────────────┴──────────┴──────────┘

Status badge colors:
  OVERDUE  → red badge   (has previous unpaid dues)
  CURRENT  → blue badge  (only current month due)
  ADVANCE  → green badge (upcoming months pre-generated)
  PAID     → grey badge  (all selected months already paid — excluded)

### Summary Stats Bar (above table)

  ┌──────────────┬──────────────┬──────────────┬────────────────┐
  │ Total        │ Overdue      │ Current Only │ Already Paid   │
  │ Students: 24 │ Students: 8  │ Students: 14 │ (Excluded): 2  │
  └──────────────┴──────────────┴──────────────┴────────────────┘

### Expand Row

Clicking a student row expands an inline detail panel:

  ▼ Rehan — 10th A
  ┌────────────────────────────────────────────────────────┐
  │ PREVIOUS DUES                                          │
  │  V.No  │ Fee Type    │ Month    │ Amount │ Balance     │
  │  9376  │ Monthly Fee │ Feb 2026 │  1400  │   1400      │
  │  9634  │ Monthly Fee │ Mar 2026 │  1400  │   1400      │
  │                              Subtotal:   2800          │
  │                                                        │
  │ SELECTED MONTHS                                        │
  │  9749  │ Monthly Fee │ Dec 2026 │  1400  │             │
  │  9750  │ Exam Fee    │ Dec 2026 │  1000  │             │
  │                              Subtotal:   2400          │
  │                                                        │
  │ Discount: 200    Net Payable: 5000    Late Fee: 0      │
  └────────────────────────────────────────────────────────┘

### Backend API

GET /api/fees/vouchers/preview-students
  Query params:
    billingMonths: string[]    e.g. ["2026-12","2027-01"]
    classNames?: string[]
    includeOverdue?: boolean   default: true

  Response:
  {
    summary: {
      total: number,
      overdue: number,
      currentOnly: number,
      alreadyPaid: number
    },
    students: [
      {
        studentId, name, className,
        previousDuesTotal: number,
        selectedMonthsTotal: number,
        grandTotal: number,
        status: "overdue"|"current"|"advance"|"paid",
        breakdown: {
          previousDues: [{ vNo, feeType, month, amount, balance }],
          currentMonths: [{ vNo, feeType, month, amount }]
        }
      }
    ]
  }

===================================================================
## MODULE 3 — CONSOLIDATED VOUCHER (PDF + PREVIEW)
===================================================================

### Voucher Layout (A5, 2 copies per page — Original + Student Copy)
### Separated by dashed cut line. No QR code. No FamilyID.

┌───────────────────────────────────────────────────┐
│           [SCHOOL NAME]                           │
│         Fee Payment Voucher                       │
│              ── Original Copy ──                  │
├────────────────────────┬──────────────────────────┤
│ Student ID  : 283      │ Father : Noor Muhammad   │
│ Student Name: Rehan    │ Class  : 10th A          │
│ Voucher No  : V-283-12 │ Due Date: 10-Dec-2026    │
├────────────────────────┴──────────────────────────┤
│ ▌ PREVIOUS OUTSTANDING DUES                       │
├──────┬──────┬──────────────┬──────────┬───────────┤
│ S.No │ V.No │ Fee Type     │ Month    │ Amount    │
├──────┼──────┼──────────────┼──────────┼───────────┤
│  1   │ 9376 │ Monthly Fee  │ Feb 2026 │  1,400    │
│  2   │ 9634 │ Monthly Fee  │ Mar 2026 │  1,400    │
├──────┴──────┴──────────────┴──────────┼───────────┤
│                    Previous Subtotal  │  2,800    │
├──────┬──────┬──────────────┬──────────┼───────────┤
│ ▌ CURRENT / SELECTED MONTHS           │           │
├──────┼──────┼──────────────┼──────────┼───────────┤
│  3   │ 9749 │ Monthly Fee  │ Dec 2026 │  1,400    │
│  4   │ 9750 │ Exam Fee     │ Dec 2026 │  1,000    │
├──────┴──────┴──────────────┴──────────┼───────────┤
│                    Current Subtotal   │  2,400    │
├───────────────────────────────────────┼───────────┤
│ Date of Payment: ________________     │           │
│                          Gross Total  │  5,200    │
│                          Discount (-) │    200    │
│                         Net Payable   │  5,000    │
│                           Late Fee    │      0    │
│               Payable within Date     │  5,000    │
│           Payable After Due Date      │  5,000    │
├───────────────────────────────────────────────────┤
│    Five Thousand Only                             │
│       *****Computer Generated Receipt*****        │
└───────────────────────────────────────────────────┘

Styling rules:
  - Section headers: bold white text on dark navy background
  - Subtotal rows: bold, light grey background, right-aligned amount
  - Summary block: two-column, right-aligned labels + bold values
  - Amount in words: italic bold centered
  - All borders: 1px solid #ccc
  - School name: large bold centered
  - Font: Arial 9pt body, 11pt headers
  - "Original Copy" / "Student Copy" label top-right of each copy

===================================================================
## BACKEND APIS (COMPLETE LIST)
===================================================================

GET  /api/fees/vouchers/preview-students     ← Module 2
GET  /api/fees/vouchers/:studentId/consolidated
       ?billingMonths[]=2026-12&billingMonths[]=2027-01
       &includeOverdue=true
POST /api/fees/vouchers/generate-batch       ← bulk PDF for all students
GET  /api/fees/vouchers/operations/:id/progress
GET  /api/fees/vouchers/operations/:id/download

### Consolidated Response Shape

{
  student: { id, name, fatherName, className },
  voucherNumber: string,
  generatedAt: string,
  dueDate: string,
  sections: {
    previousDues: [{ sno, vNo, feeType, month, amount, balance }],
    currentMonths: [{ sno, vNo, feeType, month, amount }]
  },
  summary: {
    previousDuesTotal, currentMonthsTotal, grossTotal,
    discount, netPayable, lateFee,
    payableWithinDate, payableAfterDueDate,
    amountInWords
  }
}

===================================================================
## DATABASE QUERIES
===================================================================

1. Previous unpaid dues:
   SELECT i.id, i.invoice_number, fh.name as fee_type,
          i.billing_month, i.amount,
          (i.amount - COALESCE(i.paid_amount,0)) as balance
   FROM invoices i
   JOIN fee_heads fh ON fh.id = i.fee_head_id
   WHERE i.student_id = :studentId
     AND i.status IN ('unpaid','partial')
     AND i.billing_month < :earliestSelectedMonth
   ORDER BY i.billing_month, i.display_order

2. Selected months fees:
   SELECT i.id, i.invoice_number, fh.name as fee_type,
          i.billing_month, i.amount
   FROM invoices i
   JOIN fee_heads fh ON fh.id = i.fee_head_id
   WHERE i.student_id = :studentId
     AND i.billing_month = ANY(:selectedMonths)
     AND i.status != 'paid'
   ORDER BY i.billing_month, i.display_order

3. Student fee settings:
   SELECT discount_amount, discount_type,
          late_fee_amount, due_date_day
   FROM student_fee_settings
   WHERE student_id = :studentId

===================================================================
## UTILITIES
===================================================================

  numberToWords(amount: number): string
    4990 → "Four Thousand Nine Hundred Ninety Only"
    Supports PKR, handles 0, decimals, up to 10 million

  formatCurrency(amount: number): string
    → "5,200"

  formatBillingMonth(str: string): string
    → "2026-12" → "Dec 2026"

  calculateSummary(previousDues, currentFees, settings): SummaryBlock
    Pure function — no side effects, fully testable

===================================================================
## FRONTEND COMPONENTS
===================================================================

  Pages:
    /fees/vouchers/generate          → MonthSelectorPage
    /fees/vouchers/generate/preview  → StudentPreviewPage
    /fees/vouchers/:id/preview       → VoucherPreviewPage

  Components:
    MonthSelectorTable
      - rows: MonthSelectorRow (month ▾, year ▾, checkbox)
      - footer: SelectionSummaryBar

    StudentPreviewTable
      - SummaryStatsBar (4 stat cards)
      - StudentDueRow (expandable)
      - BreakdownPanel (previous + current sections)
      - StatusBadge (OVERDUE/CURRENT/ADVANCE/PAID)

    ConsolidatedVoucher (print-ready)
      - VoucherHeader (school name, copy label)
      - StudentInfoBlock
      - FeeSectionTable (reusable for prev dues + current months)
      - SummaryBlock
      - AmountInWords

  Custom Hooks:
    useMonthSelector()       → selectedMonths, toggle, selectAll, clear
    useStudentPreview()      → React Query, filters, expand state
    useConsolidatedVoucher() → fetch, compute summary, trigger PDF

===================================================================
## PRINT / PDF REQUIREMENTS
===================================================================

- Use Puppeteer (server-side) to generate PDF
- 2 copies per A5 page: Original on top, Student Copy below
- Dashed cut line between copies (- - - ✂ - - -)
- @media print CSS hides all UI controls
- "Download PDF" calls GET /api/fees/vouchers/:id/download
- "Print" opens browser print dialog with correct page size
- Batch PDF: merges all student PDFs into one download ZIP

===================================================================
## EDGE CASES — HANDLE EXPLICITLY
===================================================================

- Student has ONLY previous dues, no current month invoice
- Student has NO previous dues (hide Previous Dues section entirely)
- All selected months already paid → exclude from batch, show in "Paid" count
- Discount exceeds total → clamp to total, show warning toast
- Partial payment exists → show balance column in previous dues
- Selected month has no fee structure → warn admin in preview screen
- Zero students found → empty state with "No outstanding dues found"

===================================================================
## CODE STANDARDS
===================================================================

- TypeScript strict mode throughout
- Backend: router → controller → service → repository layers
- React Query for all data fetching + mutations
- React Hook Form + Zod for all form validation
- Tailwind CSS for styling, lucide-react for icons
- Toast notifications on all success/error states
- All calculation logic in pure utility functions with unit tests

===================================================================
## DELIVERABLES (in order)
===================================================================

1. [ ] DB queries (all 3 above)
2. [ ] All backend API endpoints + validation
3. [ ] numberToWords + calculateSummary utilities + unit tests
4. [ ] MonthSelectorPage + MonthSelectorTable component
5. [ ] StudentPreviewPage + StudentDueRow (expandable) component
6. [ ] ConsolidatedVoucher print component (exact layout above)
7. [ ] PDF generation service (Puppeteer, 2-copy layout)
8. [ ] Batch PDF generation + ZIP download endpoint
9. [ ] All custom hooks (useMonthSelector, useStudentPreview,
       useConsolidatedVoucher)
10.[ ] TypeScript interfaces for all data shapes
11.[ ] Unit tests: summary calculation, numberToWords,
       preview-students API (overdue / clean / partial)