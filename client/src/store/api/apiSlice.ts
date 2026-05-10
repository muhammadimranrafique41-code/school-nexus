import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

export interface ApiError {
  code: number
  message: string
  details?: string
}

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api/v1",
    credentials: "include",
    prepareHeaders: (headers) => {
      return headers
    },
  }),
  tagTypes: ["Dashboard", "Attendance", "Finance", "Homework"],
  endpoints: () => ({}),
})
