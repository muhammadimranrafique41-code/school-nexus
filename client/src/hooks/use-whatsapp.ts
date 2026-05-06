/**
 * use-whatsapp.ts
 * TanStack Query hooks for the WhatsApp Notification System.
 * Connects to the backend routes registered in server/routes.ts.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirroring the backend response shapes)
// ─────────────────────────────────────────────────────────────────────────────

export type WhatsappMessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export type WhatsappMessage = {
  id: number;
  recipientNumber: string;
  recipientType: string;
  recipientId: number | null;
  messageBody: string;
  templateName: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  status: WhatsappMessageStatus;
  errorMessage: string | null;
  waMessageId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

export type WhatsappTemplate = {
  id: number;
  name: string;
  category: string;
  language: string;
  bodyText: string;
  headerText: string | null;
  footerText: string | null;
  variables: Array<{ key: string; index: number }>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WhatsappStatusResponse = {
  configured: boolean;
  phoneNumberId: string | null;
  apiVersion: string;
};

export type DiaryNotificationResult = {
  notified: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export type VoucherNotificationResult = {
  success: boolean;
  messageId: number | null;
  waMessageId: string | null;
  recipientNumber: string | null;
  error: string | null;
};

export type BulkVoucherNotificationResult = {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Query keys
// ─────────────────────────────────────────────────────────────────────────────

export const whatsappKeys = {
  all: ["whatsapp"] as const,
  status: () => [...whatsappKeys.all, "status"] as const,
  messages: (filters?: { status?: WhatsappMessageStatus; limit?: number }) =>
    [...whatsappKeys.all, "messages", filters] as const,
  templates: () => [...whatsappKeys.all, "templates"] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

/** Check if WhatsApp is configured (env vars present). */
export function useWhatsappStatus() {
  return useQuery({
    queryKey: whatsappKeys.status(),
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/whatsapp/status");
      return (await res.json()) as WhatsappStatusResponse;
    },
    staleTime: 60_000,
  });
}

/** Fetch recent WhatsApp messages with optional filters. */
export function useWhatsappMessages(opts?: {
  status?: WhatsappMessageStatus;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString() ? `?${params.toString()}` : "";

  return useQuery({
    queryKey: whatsappKeys.messages(opts),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/whatsapp/messages${qs}`);
      const data = await res.json() as { messages: WhatsappMessage[]; total: number };
      return data;
    },
    refetchInterval: 15_000, // poll every 15 s for delivery status updates
  });
}

/** Fetch active WhatsApp templates. */
export function useWhatsappTemplates() {
  return useQuery({
    queryKey: whatsappKeys.templates(),
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/whatsapp/templates");
      const data = await res.json() as { templates: WhatsappTemplate[] };
      return data.templates;
    },
    staleTime: 5 * 60_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

/** Send homework diary notifications for a specific diary entry. */
export function useSendDiaryNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      diaryId,
      useTemplate = false,
    }: {
      diaryId: number;
      useTemplate?: boolean;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/whatsapp/diary/${diaryId}/notify`,
        { useTemplate }
      );
      return (await res.json()) as DiaryNotificationResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.messages() }),
  });
}

/** Send daily diary notifications. */
export function useSendDailyDiaryNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      diaryId,
      useTemplate = false,
    }: {
      diaryId: number;
      useTemplate?: boolean;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/whatsapp/daily-diary/${diaryId}/notify`,
        { useTemplate }
      );
      return (await res.json()) as DiaryNotificationResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.messages() }),
  });
}

/** Send a single fee voucher notification. */
export function useSendVoucherNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      voucherId,
      pdfUrl,
      useTemplate = false,
    }: {
      voucherId: number;
      pdfUrl?: string;
      useTemplate?: boolean;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/whatsapp/vouchers/${voucherId}/notify`,
        { pdfUrl, useTemplate }
      );
      return (await res.json()) as VoucherNotificationResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.messages() }),
  });
}

/** Send a consolidated voucher notification. */
export function useSendConsolidatedVoucherNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      voucherId,
      pdfUrl,
      useTemplate = false,
    }: {
      voucherId: number;
      pdfUrl?: string;
      useTemplate?: boolean;
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/whatsapp/consolidated-vouchers/${voucherId}/notify`,
        { pdfUrl, useTemplate }
      );
      return (await res.json()) as VoucherNotificationResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.messages() }),
  });
}

/** Send fee payment reminder. */
export function useSendFeeReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ feeId }: { feeId: number }) => {
      const res = await apiRequest(
        "POST",
        `/api/whatsapp/fees/${feeId}/remind`,
        {}
      );
      return (await res.json()) as VoucherNotificationResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.messages() }),
  });
}

/** Send bulk voucher notifications. */
export function useSendBulkVoucherNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      voucherIds,
      useTemplate = false,
    }: {
      voucherIds: number[];
      useTemplate?: boolean;
    }) => {
      const res = await apiRequest("POST", "/api/whatsapp/vouchers/bulk-notify", {
        voucherIds,
        useTemplate,
      });
      return (await res.json()) as BulkVoucherNotificationResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: whatsappKeys.messages() }),
  });
}
