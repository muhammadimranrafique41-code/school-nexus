import { render, screen } from "@testing-library/react"
import { StatsCards } from "./StatsCards"
import { describe, it, expect } from "@jest/globals"

describe("StatsCards", () => {
  const mockStats = [
    { title: "Total Students", value: 450, hint: "15 active classes", icon: require("lucide-react").GraduationCap, iconBg: "bg-indigo-50", iconColor: "text-indigo-600", accent: "border-indigo-100" },
    { title: "Total Teachers", value: 28, hint: "Active faculty", icon: require("lucide-react").Users, iconBg: "bg-emerald-50", iconColor: "text-emerald-600", accent: "border-emerald-100" },
  ]

  it("renders all stat cards", () => {
    render(<StatsCards stats={mockStats} />)
    expect(screen.getByText("Total Students")).toBeInTheDocument()
    expect(screen.getByText("Total Teachers")).toBeInTheDocument()
  })

  it("displays values correctly", () => {
    render(<StatsCards stats={mockStats} />)
    expect(screen.getByText("450")).toBeInTheDocument()
    expect(screen.getByText("28")).toBeInTheDocument()
  })

  it("shows loading skeleton when isLoading is true", () => {
    const { container } = render(<StatsCards isLoading={true} />)
    const skeletons = container.querySelectorAll(".animate-pulse")
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it("renders with empty stats array", () => {
    render(<StatsCards stats={[]} />)
    expect(screen.queryByText("Total Students")).not.toBeInTheDocument()
  })

  it("renders correctly without optional hint", () => {
    const statsNoHint = [
      { title: "Test Stat", value: 100, icon: require("lucide-react").Users, iconBg: "bg-indigo-50", iconColor: "text-indigo-600", accent: "border-indigo-100" },
    ]
    render(<StatsCards stats={statsNoHint} />)
    expect(screen.getByText("100")).toBeInTheDocument()
  })
})
