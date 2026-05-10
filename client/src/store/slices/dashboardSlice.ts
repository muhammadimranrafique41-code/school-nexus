import { createSlice, PayloadAction } from "@reduxjs/toolkit"

interface DashboardStats {
  totalStudents: number
  totalTeachers: number
  feesCollected: number
  outstandingFees: number
  activeClasses: number
  pendingPayments: number
  overdueInvoices: number
  attendanceMarkedToday: number
}

interface DashboardState {
  stats: DashboardStats | null
  isLoading: boolean
  error: string | null
}

const initialState: DashboardState = {
  stats: null,
  isLoading: false,
  error: null,
}

const dashboardSlice = createSlice({
  name: "dashboard",
  initialState,
  reducers: {
    setDashboardStats(state, action: PayloadAction<DashboardStats>) {
      state.stats = action.payload
      state.isLoading = false
      state.error = null
    },
    setDashboardLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload
    },
    setDashboardError(state, action: PayloadAction<string>) {
      state.error = action.payload
      state.isLoading = false
    },
  },
})

export const { setDashboardStats, setDashboardLoading, setDashboardError } = dashboardSlice.actions
export default dashboardSlice.reducer
