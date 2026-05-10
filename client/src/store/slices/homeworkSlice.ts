import { createSlice, PayloadAction } from "@reduxjs/toolkit"

interface Assignment {
  id: number
  title: string
  description: string
  subject: string
  className: string
  dueDate: string
  status: "active" | "closed" | "draft"
  submissionCount: number
  totalStudents: number
}

interface HomeworkState {
  assignments: Assignment[]
  selectedAssignment: Assignment | null
  isLoading: boolean
  error: string | null
}

const initialState: HomeworkState = {
  assignments: [],
  selectedAssignment: null,
  isLoading: false,
  error: null,
}

const homeworkSlice = createSlice({
  name: "homework",
  initialState,
  reducers: {
    setAssignments(state, action: PayloadAction<Assignment[]>) {
      state.assignments = action.payload
      state.isLoading = false
      state.error = null
    },
    setSelectedAssignment(state, action: PayloadAction<Assignment | null>) {
      state.selectedAssignment = action.payload
    },
    setHomeworkLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload
    },
    setHomeworkError(state, action: PayloadAction<string>) {
      state.error = action.payload
      state.isLoading = false
    },
  },
})

export const { setAssignments, setSelectedAssignment, setHomeworkLoading, setHomeworkError } = homeworkSlice.actions
export default homeworkSlice.reducer
