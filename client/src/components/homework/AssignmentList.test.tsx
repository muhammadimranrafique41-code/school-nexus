import { render, screen, fireEvent } from "@testing-library/react"
import { AssignmentList } from "./AssignmentList"
import { describe, it, expect, vi } from "@jest/globals"

describe("AssignmentList", () => {
  const mockAssignments = [
    { id: 1, title: "Algebra Homework", subject: "Mathematics", className: "Class 10", dueDate: "2026-05-20", status: "active" as const, submissionCount: 15, totalStudents: 30 },
    { id: 2, title: "English Essay", subject: "English", className: "Class 9", dueDate: "2026-05-18", status: "closed" as const, submissionCount: 28, totalStudents: 28 },
  ]

  it("renders assignment titles", () => {
    render(<AssignmentList assignments={mockAssignments} />)
    expect(screen.getByText("Algebra Homework")).toBeInTheDocument()
    expect(screen.getByText("English Essay")).toBeInTheDocument()
  })

  it("renders status badges", () => {
    render(<AssignmentList assignments={mockAssignments} />)
    expect(screen.getByText("Active")).toBeInTheDocument()
    expect(screen.getByText("Closed")).toBeInTheDocument()
  })

  it("renders submission counts", () => {
    render(<AssignmentList assignments={mockAssignments} />)
    expect(screen.getByText("15")).toBeInTheDocument()
    expect(screen.getByText("28")).toBeInTheDocument()
  })

  it("calls onSelect when an assignment is clicked", () => {
    const onSelect = vi.fn()
    render(<AssignmentList assignments={mockAssignments} onSelect={onSelect} />)
    fireEvent.click(screen.getByText("Algebra Homework"))
    expect(onSelect).toHaveBeenCalledWith(mockAssignments[0])
  })

  it("shows loading skeleton when isLoading is true", () => {
    const { container } = render(<AssignmentList isLoading={true} />)
    const skeletons = container.querySelectorAll(".animate-pulse")
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it("shows empty state when no assignments", () => {
    render(<AssignmentList assignments={[]} />)
    expect(screen.getByText("No assignments yet")).toBeInTheDocument()
  })
})
