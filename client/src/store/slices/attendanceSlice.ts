import { createSlice, PayloadAction } from "@reduxjs/toolkit"

interface AttendanceRecord {
  id: number
  studentId: number
  studentName: string
  date: string
  status: "Present" | "Absent" | "Late" | "Excused"
  session: "Full Day" | "Morning" | "Afternoon"
}

interface AttendanceState {
  records: AttendanceRecord[]
  selectedDate: string | null
  selectedClass: string | null
  isLoading: boolean
  error: string | null
}

const initialState: AttendanceState = {
  records: [],
  selectedDate: null,
  selectedClass: null,
  isLoading: false,
  error: null,
}

const attendanceSlice = createSlice({
  name: "attendance",
  initialState,
  reducers: {
    setAttendanceRecords(state, action: PayloadAction<AttendanceRecord[]>) {
      state.records = action.payload
      state.isLoading = false
      state.error = null
    },
    setSelectedDate(state, action: PayloadAction<string>) {
      state.selectedDate = action.payload
    },
    setSelectedClass(state, action: PayloadAction<string>) {
      state.selectedClass = action.payload
    },
    setAttendanceLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload
    },
    setAttendanceError(state, action: PayloadAction<string>) {
      state.error = action.payload
      state.isLoading = false
    },
  },
})

export const {
  setAttendanceRecords, setSelectedDate, setSelectedClass,
  setAttendanceLoading, setAttendanceError,
} = attendanceSlice.actions
export default attendanceSlice.reducer
