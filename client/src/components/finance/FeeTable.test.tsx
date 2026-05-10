import { render, screen, fireEvent } from "@testing-library/react"
import { FeeTable } from "./FeeTable"
import { describe, it, expect, vi } from "@jest/globals"

describe("FeeTable", () => {
  const mockRecords = [
    { id: 1, studentName: "Alice", className: "Class 10", invoiceNumber: "INV-001", amount: 15000, paidAmount: 15000, remainingBalance: 0, status: "Paid", dueDate: "2026-05-10", billingPeriod: "May 2026" },
    { id: 2, studentName: "Bob", className: "Class 9", invoiceNumber: "INV-002", amount: 12000, paidAmount: 6000, remainingBalance: 6000, status: "Partial", dueDate: "2026-05-10", billingPeriod: "May 2026" },
  ]

  it("renders table headers", () => {
    render(<FeeTable records={mockRecords} />)
    expect(screen.getByText("Student")).toBeInTheDocument()
    expect(screen.getByText("Invoice")).toBeInTheDocument()
    expect(screen.getByText("Status")).toBeInTheDocument()
  })

  it("renders student names", () => {
    render(<FeeTable records={mockRecords} />)
    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByText("Bob")).toBeInTheDocument()
  })

  it("renders invoice numbers", () => {
    render(<FeeTable records={mockRecords} />)
    expect(screen.getByText("INV-001")).toBeInTheDocument()
    expect(screen.getByText("INV-002")).toBeInTheDocument()
  })

  it("shows loading skeleton when isLoading is true", () => {
    const { container } = render(<FeeTable isLoading={true} />)
    const skeletons = container.querySelectorAll(".animate-pulse")
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it("shows empty state when no records", () => {
    render(<FeeTable records={[]} />)
    expect(screen.getByText("No fee records found.")).toBeInTheDocument()
  })

  it("filters records by search term", () => {
    render(<FeeTable records={mockRecords} />)
    const searchInput = screen.getByPlaceholderText("Search...")
    fireEvent.change(searchInput, { target: { value: "Bob" } })
    expect(screen.getByText("Bob")).toBeInTheDocument()
    expect(screen.queryByText("Alice")).not.toBeInTheDocument()
  })
})
