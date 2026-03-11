import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, beforeEach, mock, test } from "node:test";
import express, { type RequestHandler } from "express";
import type { Session, SessionData } from "express-session";
import { api } from "../shared/routes.js";
import type { QrAttendanceEventWithUser, QrProfileWithUser, User } from "../shared/schema.js";
import { encryptQrToken, generateQrToken, hashQrToken } from "./qr-service.js";
import type { storage as StorageContract } from "./storage.js";

type MockStorage = Pick<typeof StorageContract, "getUser" | "getStudents" | "getTeachers" | "getQrProfiles" | "issueQrProfile" | "regenerateQrProfile" | "setQrProfileActive" | "getMyQrCard" | "getQrAttendanceEvents" | "getTeacherClasses" | "scanQrAttendance">;
type StoredProfile = QrProfileWithUser & { token: string };
type MockState = { users: Map<number, User>; profiles: Map<number, StoredProfile>; events: QrAttendanceEventWithUser[]; nextEventId: number };

const today = new Date().toISOString().slice(0, 10);
const isoNow = () => new Date().toISOString();
const issuePath = (userId: number) => api.qrAttendance.profiles.issue.path.replace(":userId", String(userId));
const regeneratePath = (userId: number) => api.qrAttendance.profiles.regenerate.path.replace(":userId", String(userId));
const statusPath = (userId: number) => api.qrAttendance.profiles.updateStatus.path.replace(":userId", String(userId));

function createProfile(user: User, generatedBy: number): StoredProfile {
  const publicId = user.id === 3 ? "a1b2c3d4e5f6" : "b1c2d3e4f5a6";
  const token = generateQrToken(publicId);
  const issuedAt = isoNow();

  return {
    userId: user.id,
    publicId,
    token,
    tokenCiphertext: encryptQrToken(token),
    tokenHash: hashQrToken(token),
    isActive: true,
    issuedAt,
    regeneratedAt: issuedAt,
    lastUsedAt: null,
    lastUsedBy: generatedBy,
    generatedBy,
    user,
  };
}

function createState(): MockState {
  const admin: User = { id: 1, name: "Admin User", email: "admin@school.edu", password: "secret", role: "admin", subject: null, designation: null, department: null, employeeId: null, teacherPhotoUrl: null, className: null, fatherName: null, studentPhotoUrl: null };
  const teacher: User = { id: 2, name: "Ava Teacher", email: "teacher@school.edu", password: "secret", role: "teacher", subject: "Mathematics", designation: "Senior Teacher", department: "Science Department", employeeId: "SNX-T-100", teacherPhotoUrl: "https://cdn.school.edu/ava-teacher.jpg", className: null, fatherName: null, studentPhotoUrl: null };
  const student: User = { id: 3, name: "Noah Student", email: "student@school.edu", password: "secret", role: "student", subject: null, designation: null, department: null, employeeId: null, teacherPhotoUrl: null, className: "JSS 1A", fatherName: "Daniel Student", studentPhotoUrl: "https://cdn.school.edu/noah.jpg" };
  const otherStudent: User = { id: 4, name: "Mia Other", email: "other@student.edu", password: "secret", role: "student", subject: null, designation: null, department: null, employeeId: null, teacherPhotoUrl: null, className: "JSS 2B", fatherName: "Michael Other", studentPhotoUrl: null };
  const studentProfile = createProfile(student, admin.id);
  const events: QrAttendanceEventWithUser[] = [
    { id: 1, userId: student.id, scannedBy: teacher.id, attendanceDate: today, scannedAt: isoNow(), roleSnapshot: student.role, direction: "Check In", status: "Present", scanMethod: "manual", terminalLabel: "Front Gate", notes: null, user: student, scannedByUser: teacher },
    { id: 2, userId: otherStudent.id, scannedBy: teacher.id, attendanceDate: today, scannedAt: isoNow(), roleSnapshot: otherStudent.role, direction: "Check In", status: "Late", scanMethod: "manual", terminalLabel: "North Gate", notes: null, user: otherStudent, scannedByUser: teacher },
    { id: 3, userId: teacher.id, scannedBy: teacher.id, attendanceDate: today, scannedAt: isoNow(), roleSnapshot: teacher.role, direction: "Check In", status: "Present", scanMethod: "manual", terminalLabel: "Staff Gate", notes: null, user: teacher, scannedByUser: teacher },
  ];

  return {
    users: new Map([admin, teacher, student, otherStudent].map((user) => [user.id, user])),
    profiles: new Map([[student.id, studentProfile]]),
    events,
    nextEventId: 4,
  };
}

let state = createState();

const storageMock: MockStorage = {
  async getUser(userId) { return state.users.get(userId); },
  async getStudents() { return [...state.users.values()].filter((user) => user.role === "student"); },
  async getTeachers() { return [...state.users.values()].filter((user) => user.role === "teacher"); },
  async getQrProfiles() { return [...state.profiles.values()]; },
  async issueQrProfile(userId, generatedBy) {
    const existing = state.profiles.get(userId);
    if (existing) return { profile: existing, token: existing.token, created: false };
    const user = state.users.get(userId);
    assert.ok(user);
    const profile = createProfile(user, generatedBy);
    state.profiles.set(userId, profile);
    return { profile, token: profile.token, created: true };
  },
  async regenerateQrProfile(userId, generatedBy) {
    const user = state.users.get(userId);
    assert.ok(user);
    const current = state.profiles.get(userId) ?? createProfile(user, generatedBy);
    const token = generateQrToken(current.publicId);
    const nextProfile: StoredProfile = { ...current, token, tokenCiphertext: encryptQrToken(token), tokenHash: hashQrToken(token), regeneratedAt: isoNow(), generatedBy, user };
    state.profiles.set(userId, nextProfile);
    return { profile: nextProfile, token };
  },
  async setQrProfileActive(userId, isActive) {
    const existing = state.profiles.get(userId);
    if (!existing) return undefined;
    const updated = { ...existing, isActive };
    state.profiles.set(userId, updated);
    return updated;
  },
  async getMyQrCard(userId) {
    const profile = state.profiles.get(userId);
    if (!profile) return undefined;
    return { profile, token: profile.token, recentEvents: state.events.filter((event) => event.userId === userId).slice(0, 5) };
  },
  async getQrAttendanceEvents(filters) {
    return state.events.filter((event) => (!filters.userId || event.userId === filters.userId) && (!filters.role || event.user?.role === filters.role) && (!filters.attendanceDate || event.attendanceDate === filters.attendanceDate));
  },
  async getTeacherClasses() { return [{ className: "JSS 1A" }]; },
  async scanQrAttendance(input) {
    const profile = [...state.profiles.values()].find((item) => item.token === input.token && item.isActive);
    if (!profile) return undefined;
    const duplicate = state.events.find((event) => event.userId === profile.userId && event.attendanceDate === today && event.direction === input.direction);
    if (duplicate) return { event: duplicate, duplicate: true };
    const scannedByUser = state.users.get(input.scannedBy);
    assert.ok(scannedByUser);
    const event: QrAttendanceEventWithUser = { id: state.nextEventId++, userId: profile.userId, scannedBy: input.scannedBy, attendanceDate: today, scannedAt: isoNow(), roleSnapshot: profile.user?.role ?? "student", direction: input.direction, status: input.status ?? null, scanMethod: input.scanMethod, terminalLabel: input.terminalLabel ?? null, notes: input.notes ?? null, user: profile.user, scannedByUser };
    state.events.push(event);
    return { event, duplicate: false };
  },
};

mock.module("./session.js", {
  namedExports: {
    createSessionMiddleware: (): RequestHandler => (req, _res, next) => {
      const session = {
        save: (callback?: (err?: unknown) => void) => callback?.(),
        destroy: (callback?: (err?: unknown) => void) => callback?.(),
      } as Session & Partial<SessionData>;
      const userId = req.header("x-test-user-id");
      if (userId) session.userId = Number(userId);
      req.session = session as Session & SessionData;
      next();
    },
  },
});

mock.module("./storage.js", { namedExports: { storage: storageMock } });

const { registerRoutes } = await import("./routes.js");

let server: Server;
let baseUrl = "";
const nativeFetch = globalThis.fetch.bind(globalThis);

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => { state = createState(); });
after(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });

async function requestJson(path: string, options: { userId?: number; method?: string; body?: unknown } = {}) {
  const headers = new Headers();
  if (options.userId) headers.set("x-test-user-id", String(options.userId));
  if (options.body !== undefined) headers.set("content-type", "application/json");
  const response = await nativeFetch(`${baseUrl}${path}`, { method: options.method ?? "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  return { status: response.status, json: await response.json() };
}

async function request(path: string, options: { userId?: number; method?: string; body?: BodyInit | null } = {}) {
  const headers = new Headers();
  if (options.userId) headers.set("x-test-user-id", String(options.userId));
  return nativeFetch(`${baseUrl}${path}`, { method: options.method ?? "GET", headers, body: options.body });
}

test("QR roster requires an authenticated admin session", async () => {
  const unauthenticated = await requestJson(api.qrAttendance.profiles.list.path);
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(unauthenticated.json, { message: "Not authenticated" });

  const forbidden = await requestJson(api.qrAttendance.profiles.list.path, { userId: 3 });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(forbidden.json, { message: "Forbidden" });
});

test("admin can load the QR roster summary", async () => {
  const result = await requestJson(api.qrAttendance.profiles.list.path, { userId: 1 });
  const parsed = api.qrAttendance.profiles.list.responses[200].parse(result.json);
  assert.equal(result.status, 200);
  assert.equal(parsed.data?.summary.eligibleUsers, 3);
  assert.equal(parsed.data?.summary.issuedProfiles, 1);
  assert.equal(parsed.data?.summary.scansToday, 3);
});

test("admin can issue, regenerate, and deactivate a QR profile", async () => {
  const issued = await requestJson(issuePath(2), { userId: 1, method: api.qrAttendance.profiles.issue.method });
  const issuedParsed = api.qrAttendance.profiles.issue.responses[200].parse(issued.json);
  assert.equal(issued.status, 200);
  assert.equal(issuedParsed.message, "QR card issued successfully");

  const regenerated = await requestJson(regeneratePath(2), { userId: 1, method: api.qrAttendance.profiles.regenerate.method });
  const regeneratedParsed = api.qrAttendance.profiles.regenerate.responses[200].parse(regenerated.json);
  assert.equal(regenerated.status, 200);
  assert.notEqual(regeneratedParsed.data?.token, issuedParsed.data?.token);

  const deactivated = await requestJson(statusPath(2), { userId: 1, method: api.qrAttendance.profiles.updateStatus.method, body: { isActive: false } });
  const deactivatedParsed = api.qrAttendance.profiles.updateStatus.responses[200].parse(deactivated.json);
  assert.equal(deactivated.status, 200);
  assert.equal(deactivatedParsed.data?.profile.isActive, false);
});

test("issue rejects invalid ids and non-eligible target roles", async () => {
  const invalidId = await requestJson(issuePath(Number.NaN), { userId: 1, method: api.qrAttendance.profiles.issue.method });
  assert.equal(invalidId.status, 400);
  assert.deepEqual(invalidId.json, { success: false, error: "Invalid user id" });

  const adminTarget = await requestJson(issuePath(1), { userId: 1, method: api.qrAttendance.profiles.issue.method });
  assert.equal(adminTarget.status, 404);
  assert.deepEqual(adminTarget.json, { success: false, error: "QR cards can only be issued to students and teachers" });
});

test("status update returns 404 when the profile does not exist", async () => {
  const missing = await requestJson(statusPath(2), {
    userId: 1,
    method: api.qrAttendance.profiles.updateStatus.method,
    body: { isActive: false },
  });

  assert.equal(missing.status, 404);
  assert.deepEqual(missing.json, { success: false, error: "QR card not found" });
});

test("student can load their own QR card but admin cannot", async () => {
  const studentCard = await requestJson(api.qrAttendance.myCard.path, { userId: 3 });
  const parsed = api.qrAttendance.myCard.responses[200].parse(studentCard.json);
  assert.equal(studentCard.status, 200);
  assert.equal(parsed.data?.profile.userId, 3);
  assert.equal(parsed.data?.profile.user?.fatherName, "Daniel Student");
  assert.equal(parsed.data?.profile.user?.studentPhotoUrl, "https://cdn.school.edu/noah.jpg");
  assert.equal(parsed.data?.recentEvents.length, 1);

  const forbidden = await requestJson(api.qrAttendance.myCard.path, { userId: 1 });
  assert.equal(forbidden.status, 403);
  assert.deepEqual(forbidden.json, { message: "Forbidden" });
});

test("teacher can load their own QR card with teacher identity fields after issuance", async () => {
  const issued = await requestJson(issuePath(2), { userId: 1, method: api.qrAttendance.profiles.issue.method });
  assert.equal(issued.status, 200);

  const teacherCard = await requestJson(api.qrAttendance.myCard.path, { userId: 2 });
  const parsed = api.qrAttendance.myCard.responses[200].parse(teacherCard.json);
  assert.equal(teacherCard.status, 200);
  assert.equal(parsed.data?.profile.userId, 2);
  assert.equal(parsed.data?.profile.user?.designation, "Senior Teacher");
  assert.equal(parsed.data?.profile.user?.department, "Science Department");
  assert.equal(parsed.data?.profile.user?.employeeId, "SNX-T-100");
  assert.equal(parsed.data?.profile.user?.teacherPhotoUrl, "https://cdn.school.edu/ava-teacher.jpg");
});

test("portrait proxy requires authentication, blocks local hosts, and streams remote images for QR cards", async () => {
  const remoteUrl = "https://cdn.school.edu/ava-teacher.jpg";
  const unauthenticated = await request(`${api.qrAttendance.portraitProxy.path}?url=${encodeURIComponent(remoteUrl)}`);
  assert.equal(unauthenticated.status, 401);

  const blocked = await request(`${api.qrAttendance.portraitProxy.path}?url=${encodeURIComponent("http://127.0.0.1/private.png")}`, { userId: 2 });
  assert.equal(blocked.status, 400);
  assert.deepEqual(await blocked.json(), { message: "Portrait proxy blocked this hostname" });

  const fetchMock = mock.method(globalThis, "fetch", async (input) => {
    assert.equal(String(input), remoteUrl);
    return new Response(Uint8Array.from([137, 80, 78, 71]), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  });

  try {
    const proxied = await request(`${api.qrAttendance.portraitProxy.path}?url=${encodeURIComponent(remoteUrl)}`, { userId: 2 });
    assert.equal(proxied.status, 200);
    assert.equal(proxied.headers.get("content-type"), "image/png");
    assert.equal(proxied.headers.get("vary"), "Cookie");
    assert.deepEqual(Array.from(new Uint8Array(await proxied.arrayBuffer())), [137, 80, 78, 71]);
  } finally {
    fetchMock.mock.restore();
  }
});

test("my card returns 404 when an eligible user has no issued profile", async () => {
  const missing = await requestJson(api.qrAttendance.myCard.path, { userId: 2 });
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.json, { success: false, error: "QR card not available for this account" });
});

test("teacher history includes their own records, their scans, and assigned class roster", async () => {
  const history = await requestJson(`${api.qrAttendance.history.path}?attendanceDate=${today}`, { userId: 2 });
  const parsed = api.qrAttendance.history.responses[200].parse(history.json);
  assert.equal(history.status, 200);
  assert.deepEqual(parsed.data?.events.map((event) => event.userId).sort((left, right) => left - right), [2, 3, 4]);
});

test("history validation rejects malformed query values", async () => {
  const response = await requestJson(`${api.qrAttendance.history.path}?userId=bad-value`, { userId: 1 });
  assert.equal(response.status, 400);
  assert.equal(response.json.success, false);
});

test("scan rejects malformed tokens before storage lookup", async () => {
  const response = await requestJson(api.qrAttendance.scan.path, { userId: 2, method: api.qrAttendance.scan.method, body: { token: "bad-token", direction: "Check In", scanMethod: "camera" } });
  assert.equal(response.status, 400);
  assert.deepEqual(response.json, { success: false, error: "Invalid QR token format" });
});

test("scan returns 404 for a valid but unknown token", async () => {
  const response = await requestJson(api.qrAttendance.scan.path, {
    userId: 2,
    method: api.qrAttendance.scan.method,
    body: { token: generateQrToken("abcdef123456"), direction: "Check In", scanMethod: "camera" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(response.json, { success: false, error: "QR card not found or inactive" });
});

test("scan records one event and deduplicates repeated direction scans", async () => {
  const teacherIssue = await requestJson(issuePath(2), { userId: 1, method: api.qrAttendance.profiles.issue.method });
  const teacherToken = api.qrAttendance.profiles.issue.responses[200].parse(teacherIssue.json).data?.token;
  assert.ok(teacherToken);

  const first = await requestJson(api.qrAttendance.scan.path, { userId: 1, method: api.qrAttendance.scan.method, body: { token: teacherToken, direction: "Check Out", scanMethod: "camera", terminalLabel: "Main Gate" } });
  const firstParsed = api.qrAttendance.scan.responses[200].parse(first.json);
  assert.equal(first.status, 200);
  assert.equal(firstParsed.data?.duplicate, false);

  const duplicate = await requestJson(api.qrAttendance.scan.path, { userId: 1, method: api.qrAttendance.scan.method, body: { token: teacherToken, direction: "Check Out", scanMethod: "camera", terminalLabel: "Main Gate" } });
  const duplicateParsed = api.qrAttendance.scan.responses[200].parse(duplicate.json);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicateParsed.data?.duplicate, true);
  assert.equal(state.events.filter((event) => event.userId === 2 && event.direction === "Check Out").length, 1);
});