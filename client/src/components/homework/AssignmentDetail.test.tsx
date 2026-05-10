import { render, screen } from "@testing-library/react"
import { AssignmentDetail } from "./AssignmentDetail"
import { describe, it, expect } from "@jest/globals"

describe("AssignmentDetail", () => {
  const mockAssignment = {
    id: 1,
    title: "Algebra Homework",
    description: "Solve exercises 5.1 to 5.10",
    subject: "Mathematics",
    className: "Class 10",
    dueDate: "2026-05-20",
    createdAt: "2026-05-10",
    status: "active" as const,
    submissionCount: 15,
    totalStudents: 30,
  }

  it("renders assignment title", () => {
    render(<AssignmentDetail assignment={mockAssignment} />)
    expect(screen.getByText("Algebra Homework")).toBeInTheDocument()
  })

  it("renders subject and class", () => {
    render(<AssignmentDetail assignment={mockAssignment} />)
    expect(screen.getByText(/Mathematics/)).toBeInTheDocument()
    expect(screen.getByText(/Class 10/)).toBeInTheDocument()
  })

  it("renders status badge", () => {
    render(<AssignmentDetail assignment={mockAssignment} />)
    expect(screen.getByText("Active")).toBeInTheDocument()
  })

  it("renders submission stats", () => {
    render(<AssignmentDetail assignment={mockAssignment} />)
    expect(screen.getByText("15/30")).toBeInTheDocument()
  })

  it("shows placeholder when no assignment selected", () => {
    render(<AssignmentDetail assignment={null} />)
    expect(screen.getByText("Select an assignment")).toBeInTheDocument()
  })

  it("shows loading skeleton when isLoading is true", () => {
    const { container } = render(<AssignmentDetail isLoading={true} />)
    const skeletons = container.querySelectorAll(".animate-pulse")
    expect(skeletons.length).toBeGreaterThan(0)
  })
})
