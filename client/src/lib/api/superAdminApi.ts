import { apiRequest } from "@/lib/queryClient";

export interface PlatformStats {
  totalOwners: number;
  totalCampuses: number;
  totalStudents: number;
  totalRevenuePaise: number;
  totalPendingDuesPaise: number;
  activeSchools: number;
  inactiveSchools: number;
  suspendedSchools: number;
  trialSchools: number;
  platformGrowthPercent30d: number;
  pendingInvoicesCount: number;
  overdueInvoicesCount: number;
}

export interface OwnerRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  plan: string;
  status: string;
  campusCount: number;
  studentCount: number;
  pendingDuesPaise: number;
  lastBillingDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BillingRecordRow {
  id: number;
  ownerId: number;
  ownerName: string;
  campusId: number;
  campusName: string;
  amountPaise: number;
  status: string;
  billingMonth: number;
  billingYear: number;
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
}

export interface SystemHealth {
  databaseConnected: boolean;
  databaseLatencyMs: number;
  storageUsedBytes: number;
  storageTotalBytes: number;
  apiLatencyP50Ms: number;
  apiLatencyP95Ms: number;
  activeSessions: number;
  timestamp: string;
}

export interface AuditLogEntry {
  id: number;
  actorId: number | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: number | null;
  targetOwnerId: number | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface PlatformSetting {
  id: number;
  key: string;
  value: unknown;
  description: string | null;
  category: string;
  isEncrypted: boolean;
  updatedBy: number | null;
  updatedAt: string;
}

export interface Campus {
  id: number;
  name: string;
  subdomain: string;
  address: string;
  ownerId: number;
  isActive: boolean;
  createdAt: string;
}

interface ApiListResponse<T> {
  data: T[];
  total: number;
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await apiRequest("GET", url);
  const body = await res.json();
  return body.data;
}

async function apiPost<T>(url: string, data?: unknown): Promise<T> {
  const res = await apiRequest("POST", url, data);
  const body = await res.json();
  return body.data;
}

async function apiPatch<T>(url: string, data?: unknown): Promise<T> {
  const res = await apiRequest("PATCH", url, data);
  const body = await res.json();
  return body.data;
}

async function apiDelete(url: string): Promise<void> {
  await apiRequest("DELETE", url);
}

async function apiGetList<T>(url: string, params?: Record<string, string>): Promise<ApiListResponse<T>> {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  const res = await apiRequest("GET", `${url}${qs}`);
  return res.json();
}

export const superAdminApi = {
  getPlatformStats: (): Promise<PlatformStats> =>
    apiGet<PlatformStats>("/api/super-admin/platform-stats"),
  getOwners: (): Promise<OwnerRow[]> =>
    apiGet<OwnerRow[]>("/api/super-admin/owners"),
  getOwner: (id: number): Promise<OwnerRow> =>
    apiGet<OwnerRow>(`/api/super-admin/owners/${id}`),
  createOwner: (data: unknown): Promise<OwnerRow> =>
    apiPost<OwnerRow>("/api/super-admin/owners", data),
  updateOwnerStatus: (id: number, data: unknown): Promise<OwnerRow> =>
    apiPatch<OwnerRow>(`/api/super-admin/owners/${id}/status`, data),
  deleteOwner: (id: number): Promise<void> =>
    apiDelete(`/api/super-admin/owners/${id}`),
  getOwnerCampuses: (id: number): Promise<Campus[]> =>
    apiGet<Campus[]>(`/api/super-admin/owners/${id}/campuses`),
  getBilling: (params?: Record<string, string>): Promise<ApiListResponse<BillingRecordRow>> =>
    apiGetList<BillingRecordRow>("/api/super-admin/billing", params),
  overrideBilling: (id: number, data: unknown): Promise<BillingRecordRow> =>
    apiPatch<BillingRecordRow>(`/api/super-admin/billing/${id}/status`, data),
  getAuditLogs: (params?: Record<string, string>): Promise<ApiListResponse<AuditLogEntry>> =>
    apiGetList<AuditLogEntry>("/api/super-admin/audit-logs", params),
  getSystemHealth: (): Promise<SystemHealth> =>
    apiGet<SystemHealth>("/api/super-admin/system-health"),
  getSettings: (): Promise<PlatformSetting[]> =>
    apiGet<PlatformSetting[]>("/api/super-admin/platform-settings"),
  updateSetting: (key: string, value: unknown): Promise<unknown> =>
    apiPatch(`/api/super-admin/platform-settings/${key}`, { value }),
  impersonate: (targetUserId: number, targetRole: string): Promise<{ impersonationToken: string }> =>
    apiPost<{ impersonationToken: string }>("/api/super-admin/impersonate", { targetUserId, targetRole }),
  endImpersonation: (): Promise<void> =>
    apiPost<void>("/api/super-admin/end-impersonation"),
};
