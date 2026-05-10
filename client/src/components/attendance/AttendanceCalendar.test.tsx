import { render, screen, fireEvent } from "@testing-library/react"
import { AttendanceCalendar } from "./AttendanceCalendar"
import { describe, it, expect, vi } from "@jest/globals"

describe("AttendanceCalendar", () => {
  it("renders month and year in header", () => {
    render(<AttendanceCalendar year={2026} month={5} />)
    expect(screen.getByText(/May 2026/i)).toBeInTheDocument()
  })

  it("renders day name headers", () => {
    render(<AttendanceCalendar year={2026} month={5} />)
    expect(screen.getByText("Sun")).toBeInTheDocument()
    expect(screen.getByText("Mon")).toBeInTheDocument()
  })

  it("renders all days of the month", () => {
    render(<AttendanceCalendar year={2026} month={5} />)
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getByText("31")).toBeInTheDocument()
  })

  it("shows legend for status colors", () => {
    render(<AttendanceCalendar year={2026} month={5} />)
    expect(screen.getByText("present")).toBeInTheDocument()
    expect(screen.getByText("absent")).toBeInTheDocument()
  })

  it("calls onDayClick when a day is clicked", () => {
    const onDayClick = vi.fn()
    render(<AttendanceCalendar year={2026} month={5} onDayClick={onDayClick} />)
    fireEvent.click(screen.getByText("15"))
    expect(onDayClick).toHaveBeenCalledWith("2026-05-15")
  })
})
