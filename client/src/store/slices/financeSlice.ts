import { createSlice, PayloadAction } from "@reduxjs/toolkit"

interface FeeRecord {
  id: number
  studentId: number
  studentName: string
  amount: number
  paidAmount: number
  remainingBalance: number
  status: string
  dueDate: string
  billingPeriod: string
}

interface FinanceState {
  invoices: FeeRecord[]
  selectedMonth: string | null
  isLoading: boolean
  error: string | null
}

const initialState: FinanceState = {
  invoices: [],
  selectedMonth: null,
  isLoading: false,
  error: null,
}

const financeSlice = createSlice({
  name: "finance",
  initialState,
  reducers: {
    setInvoices(state, action: PayloadAction<FeeRecord[]>) {
      state.invoices = action.payload
      state.isLoading = false
      state.error = null
    },
    setSelectedMonth(state, action: PayloadAction<string>) {
      state.selectedMonth = action.payload
    },
    setFinanceLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload
    },
    setFinanceError(state, action: PayloadAction<string>) {
      state.error = action.payload
      state.isLoading = false
    },
  },
})

export const { setInvoices, setSelectedMonth, setFinanceLoading, setFinanceError } = financeSlice.actions
export default financeSlice.reducer
