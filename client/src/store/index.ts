import { configureStore } from "@reduxjs/toolkit"
import { apiSlice } from "./api/apiSlice"
import authReducer from "./slices/authSlice"
import dashboardReducer from "./slices/dashboardSlice"
import attendanceReducer from "./slices/attendanceSlice"
import financeReducer from "./slices/financeSlice"
import homeworkReducer from "./slices/homeworkSlice"

export const store = configureStore({
  reducer: {
    auth: authReducer,
    dashboard: dashboardReducer,
    attendance: attendanceReducer,
    finance: financeReducer,
    homework: homeworkReducer,
    [apiSlice.reducerPath]: apiSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(apiSlice.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
