import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueueOfflineQrAttendanceScan,
  isRecentQrScanDuplicate,
  markOfflineQrAttendanceScanError,
  readOfflineQrAttendanceQueue,
  removeOfflineQrAttendanceScan,
} from "./qr-attendance-offline";

function createMemoryStorage() {
  const state = new Map<string, string>();

  return {
    getItem(key: string) {
      return state.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
    removeItem(key: string) {
      state.delete(key);
    },
  };
}

test("offline queue stores validated scans and can remove invalid persisted payloads", () => {
  const storage = createMemoryStorage();

  const queue = enqueueOfflineQrAttendanceScan(
    { token: "SNXQR-12345678-ABCDEFGH", direction: "Check In", scanMethod: "camera", notes: "Front gate" },
    storage,
  );

  assert.equal(queue.length, 1);
  assert.equal(queue[0]?.payload.scanMethod, "camera");

  storage.setItem("school-nexus.qr-attendance.offline-queue", JSON.stringify([{ bad: true }]));
  assert.deepEqual(readOfflineQrAttendanceQueue(storage), []);
});

test("offline queue items can be marked with errors and removed after replay", () => {
  const storage = createMemoryStorage();
  const [queued] = enqueueOfflineQrAttendanceScan(
    { token: "SNXQR-87654321-HGFEDCBA", direction: "Check Out", scanMethod: "manual" },
    storage,
  );

  const withError = markOfflineQrAttendanceScanError(queued!.id, "Waiting for network", storage);
  assert.equal(withError[0]?.lastError, "Waiting for network");

  const emptied = removeOfflineQrAttendanceScan(queued!.id, storage);
  assert.deepEqual(emptied, []);
});

test("recent scan dedupe only suppresses identical token and direction inside the 2 second window", () => {
  const recent = { token: "SNXQR-11112222-AAAABBBB", direction: "Check In" as const, at: 10_000 };

  assert.equal(isRecentQrScanDuplicate(recent, "SNXQR-11112222-AAAABBBB", "Check In", 11_500), true);
  assert.equal(isRecentQrScanDuplicate(recent, "SNXQR-11112222-AAAABBBB", "Check Out", 11_500), false);
  assert.equal(isRecentQrScanDuplicate(recent, "SNXQR-99990000-AAAABBBB", "Check In", 11_500), false);
  assert.equal(isRecentQrScanDuplicate(recent, "SNXQR-11112222-AAAABBBB", "Check In", 12_500), false);
});