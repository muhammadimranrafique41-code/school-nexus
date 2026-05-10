import { http, HttpResponse } from "msw"

export const handlers = [
  http.get("/api/v1/dashboard/stats", () => {
    return HttpResponse.json({
      totalStudents: 450,
      totalTeachers: 28,
      feesCollected: 1250000,
      outstandingFees: 340000,
      activeClasses: 15,
      pendingPayments: 42,
      overdueInvoices: 8,
      attendanceMarkedToday: 320,
    })
  }),

  http.get("/api/v1/attendance/records", () => {
    return HttpResponse.json([
      { id: 1, studentId: 101, studentName: "Alice", date: "2026-05-11", status: "Present", session: "Full Day" },
      { id: 2, studentId: 102, studentName: "Bob", date: "2026-05-11", status: "Absent", session: "Full Day" },
      { id: 3, studentId: 103, studentName: "Charlie", date: "2026-05-11", status: "Late", session: "Morning" },
    ])
  }),

  http.get("/api/v1/finance/invoices", () => {
    return HttpResponse.json([
      { id: 1, studentName: "Alice", className: "Class 10", invoiceNumber: "INV-001", amount: 15000, paidAmount: 15000, remainingBalance: 0, status: "Paid", dueDate: "2026-05-10", billingPeriod: "May 2026" },
      { id: 2, studentName: "Bob", className: "Class 9", invoiceNumber: "INV-002", amount: 12000, paidAmount: 6000, remainingBalance: 6000, status: "Partial", dueDate: "2026-05-10", billingPeriod: "May 2026" },
      { id: 3, studentName: "Charlie", className: "Class 11", invoiceNumber: "INV-003", amount: 18000, paidAmount: 0, remainingBalance: 18000, status: "Unpaid", dueDate: "2026-05-10", billingPeriod: "May 2026" },
    ])
  }),

  http.get("/api/v1/homework/assignments", () => {
    return HttpResponse.json([
      { id: 1, title: "Algebra Homework", subject: "Mathematics", className: "Class 10", dueDate: "2026-05-20", status: "active", submissionCount: 15, totalStudents: 30, description: "Solve exercises 5.1 to 5.10", createdAt: "2026-05-10" },
      { id: 2, title: "English Essay", subject: "English", className: "Class 9", dueDate: "2026-05-18", status: "active", submissionCount: 22, totalStudents: 28, description: "Write a 500-word essay on climate change.", createdAt: "2026-05-08" },
    ])
  }),

  http.get("/api/v1/auth/me", () => {
    return HttpResponse.json({ id: 1, name: "Admin User", email: "admin@school.com", role: "admin" })
  }),
]
