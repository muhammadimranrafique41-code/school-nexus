import { api } from "@shared/routes";
import { z } from "zod";

const offlineQueueStorageKey = "school-nexus.qr-attendance.offline-queue";

const queuedQrAttendanceScanSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  payload: api.qrAttendance.scan.input,
  lastError: z.string().nullable().optional(),
});

const queuedQrAttendanceListSchema = z.array(queuedQrAttendanceScanSchema);

export type QueuedQrAttendanceScan = z.infer<typeof queuedQrAttendanceScanSchema>;
export type RecentQrScanAttempt = {
  token: string;
  direction: z.infer<typeof api.qrAttendance.scan.input>["direction"];
  at: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function resolveStorage(storage?: StorageLike | null) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function buildQueueId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `qr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readOfflineQrAttendanceQueue(storage?: StorageLike | null) {
  const target = resolveStorage(storage);
  if (!target) return [] as QueuedQrAttendanceScan[];

  const raw = target.getItem(offlineQueueStorageKey);
  if (!raw) return [] as QueuedQrAttendanceScan[];

  try {
    return queuedQrAttendanceListSchema.parse(JSON.parse(raw));
  } catch {
    target.removeItem(offlineQueueStorageKey);
    return [] as QueuedQrAttendanceScan[];
  }
}

export function writeOfflineQrAttendanceQueue(queue: QueuedQrAttendanceScan[], storage?: StorageLike | null) {
  const target = resolveStorage(storage);
  if (!target) return queue;

  if (queue.length === 0) {
    target.removeItem(offlineQueueStorageKey);
    return queue;
  }

  target.setItem(offlineQueueStorageKey, JSON.stringify(queue));
  return queue;
}

export function createQueuedQrAttendanceScan(
  payload: z.input<typeof api.qrAttendance.scan.input>,
  createdAt = new Date().toISOString(),
): QueuedQrAttendanceScan {
  return {
    id: buildQueueId(),
    createdAt,
    payload: api.qrAttendance.scan.input.parse(payload),
    lastError: null,
  };
}

export function enqueueOfflineQrAttendanceScan(
  payload: z.input<typeof api.qrAttendance.scan.input>,
  storage?: StorageLike | null,
) {
  const nextQueue = [...readOfflineQrAttendanceQueue(storage), createQueuedQrAttendanceScan(payload)];
  return writeOfflineQrAttendanceQueue(nextQueue, storage);
}

export function removeOfflineQrAttendanceScan(id: string, storage?: StorageLike | null) {
  const nextQueue = readOfflineQrAttendanceQueue(storage).filter((item) => item.id !== id);
  return writeOfflineQrAttendanceQueue(nextQueue, storage);
}

export function markOfflineQrAttendanceScanError(id: string, message: string, storage?: StorageLike | null) {
  const nextQueue = readOfflineQrAttendanceQueue(storage).map((item) => (
    item.id === id ? { ...item, lastError: message } : item
  ));
  return writeOfflineQrAttendanceQueue(nextQueue, storage);
}

export function isRecentQrScanDuplicate(
  recentScan: RecentQrScanAttempt | null,
  token: string,
  direction: z.infer<typeof api.qrAttendance.scan.input>["direction"],
  now = Date.now(),
  duplicateWindowMs = 2000,
) {
  if (!recentScan) return false;
  if (recentScan.token !== token.trim()) return false;
  if (recentScan.direction !== direction) return false;
  return now - recentScan.at < duplicateWindowMs;
}