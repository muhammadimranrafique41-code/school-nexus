import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { api } from "@shared/routes"
import { schoolSettingsDataSchema } from "@shared/settings"
import { getResponseErrorMessage, setCachedPublicSchoolSettings } from "@/lib/utils"

function invalidateSettingsQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [api.settings.publicGet.path] })
  queryClient.invalidateQueries({ queryKey: [api.settings.adminGet.path] })
  queryClient.invalidateQueries({ queryKey: [api.dashboard.adminStats.path] })
}

export function usePublicSchoolSettings() {
  return useQuery({
    queryKey: [api.settings.publicGet.path],
    queryFn: async () => {
      const res = await fetch(api.settings.publicGet.path, { credentials: "include" })
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch school settings"))
      const parsed = api.settings.publicGet.responses[200].parse(await res.json())
      setCachedPublicSchoolSettings(parsed)
      return parsed
    },
  })
}

export function useAdminSchoolSettings(enabled = true) {
  return useQuery({
    queryKey: [api.settings.adminGet.path],
    enabled,
    queryFn: async () => {
      const res = await fetch(api.settings.adminGet.path, { credentials: "include" })
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to fetch admin settings"))
      const parsed = api.settings.adminGet.responses[200].parse(await res.json())
      setCachedPublicSchoolSettings(parsed.publicSettings)
      return parsed
    },
  })
}

export function useUpdateSchoolSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: z.infer<typeof api.settings.update.input>) => {
      const validated = api.settings.update.input.parse(input)
      const res = await fetch(api.settings.update.path, {
        method: api.settings.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      })
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to update school settings"))
      return api.settings.update.responses[200].parse(await res.json())
    },
    onSuccess: (response) => {
      setCachedPublicSchoolSettings(response.publicSettings)
      queryClient.setQueryData([api.settings.publicGet.path], response.publicSettings)
      queryClient.setQueryData([api.settings.adminGet.path], response)
      invalidateSettingsQueries(queryClient)
    },
  })
}

export function useImportSchoolSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: z.infer<typeof api.settings.import.input>) => {
      const validated = api.settings.import.input.parse(input)
      const res = await fetch(api.settings.import.path, {
        method: api.settings.import.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      })
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to import school settings"))
      return api.settings.import.responses[200].parse(await res.json())
    },
    onSuccess: (response) => {
      setCachedPublicSchoolSettings(response.publicSettings)
      queryClient.setQueryData([api.settings.publicGet.path], response.publicSettings)
      queryClient.setQueryData([api.settings.adminGet.path], response)
      invalidateSettingsQueries(queryClient)
    },
  })
}

export function useRestoreSchoolSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: z.infer<typeof api.settings.restore.input>) => {
      const validated = api.settings.restore.input.parse(input)
      const res = await fetch(api.settings.restore.path, {
        method: api.settings.restore.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      })
      if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to restore school settings"))
      return api.settings.restore.responses[200].parse(await res.json())
    },
    onSuccess: (response) => {
      setCachedPublicSchoolSettings(response.publicSettings)
      queryClient.setQueryData([api.settings.publicGet.path], response.publicSettings)
      queryClient.setQueryData([api.settings.adminGet.path], response)
      invalidateSettingsQueries(queryClient)
    },
  })
}

export async function exportSchoolSettings() {
  const res = await fetch(api.settings.export.path, { credentials: "include" })
  if (!res.ok) throw new Error(await getResponseErrorMessage(res, "Failed to export school settings"))
  return api.settings.export.responses[200].parse(await res.json())
}

export function parseImportedSchoolSettings(raw: string) {
  const parsed = JSON.parse(raw) as { data?: unknown }
  return schoolSettingsDataSchema.parse(parsed.data ?? parsed)
}