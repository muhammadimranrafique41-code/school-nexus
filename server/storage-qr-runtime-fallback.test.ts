import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { qrAttendanceEvents, qrProfiles, type Attendance, type User } from "../shared/schema.js";

const admin: User = { id: 1, name: "Admin User", email: "admin@school.edu", password: "secret", role: "admin", subject: null, className: null, fatherName: null, studentPhotoUrl: null };
const teacher: User = { id: 2, name: "Ava Teacher", email: "teacher@school.edu", password: "secret", role: "teacher", subject: "Mathematics", className: null, fatherName: null, studentPhotoUrl: null };
const student: User = { id: 3, name: "Noah Student", email: "student@school.edu", password: "secret", role: "student", subject: null, className: "JSS 1A", fatherName: "Daniel Student", studentPhotoUrl: "https://cdn.school.edu/noah.jpg" };
const users = new Map([admin, teacher, student].map((user) => [user.id, user]));
const missingRelationError = { code: "42P01" };

function missingQuery() {
  const promise = Promise.reject(missingRelationError);
  return {
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise),
    where() { return promise; },
    limit() { return promise; },
    returning() { return promise; },
  };
}

mock.module("./db.js", {
  namedExports: {
    db: {
      select() {
        return {
          from(table: unknown) {
            if (table === qrProfiles || table === qrAttendanceEvents) return missingQuery();
            throw new Error("Unexpected select in QR runtime fallback test");
          },
        };
      },
      insert(table: unknown) {
        if (table !== qrProfiles && table !== qrAttendanceEvents) throw new Error("Unexpected insert in QR runtime fallback test");
        return { values() { return { returning() { return Promise.reject(missingRelationError); } }; } };
      },
      update(table: unknown) {
        if (table !== qrProfiles && table !== qrAttendanceEvents) throw new Error("Unexpected update in QR runtime fallback test");
        return {
          set() {
            return {
              where() {
                return { returning() { return Promise.reject(missingRelationError); } };
              },
            };
          },
        };
      },
    },
  },
});

const { DatabaseStorage } = await import("./storage.js");

test("QR issue/regenerate/scan flows fall back safely when QR tables are missing", async () => {
  const storage = new DatabaseStorage();
  const storageHarness = storage as unknown as {
    getUsersMap: () => Promise<Map<number, User>>;
    getUser: (id: number) => Promise<User | undefined>;
    createAttendance: (record: { studentId: number; teacherId: number; date: string; status: string; session: string; remarks: string | null }) => Promise<Attendance>;
  };

  storageHarness.getUsersMap = async () => new Map(users);
  storageHarness.getUser = async (id: number) => users.get(id);
  storageHarness.createAttendance = async (record) => ({ id: 1, ...record });

  const issued = await storage.issueQrProfile(student.id, admin.id);
  assert.equal(issued.created, true);
  assert.equal(issued.profile.userId, student.id);
  assert.equal(issued.profile.user?.name, student.name);
  assert.equal(issued.profile.user?.fatherName, student.fatherName);

  const roster = await storage.getQrProfiles();
  assert.equal(roster.length, 1);
  assert.equal(roster[0]?.userId, student.id);

  const card = await storage.getMyQrCard(student.id);
  assert.ok(card);
  assert.equal(card?.token, issued.token);
  assert.deepEqual(card?.recentEvents, []);

  const regenerated = await storage.regenerateQrProfile(student.id, admin.id);
  assert.notEqual(regenerated.token, issued.token);
  assert.equal(regenerated.profile.isActive, true);

  const scan = await storage.scanQrAttendance({
    token: regenerated.token,
    scannedBy: teacher.id,
    direction: "Check In",
    status: "Present",
    scanMethod: "manual",
    terminalLabel: "Front Gate",
    notes: "On time",
  });
  assert.ok(scan);
  assert.equal(scan?.duplicate, false);
  assert.equal(scan?.event.userId, student.id);
  assert.equal(scan?.attendanceRecord?.student?.id, student.id);
  assert.equal(scan?.event.scannedByUser?.id, teacher.id);

  const duplicate = await storage.scanQrAttendance({
    token: regenerated.token,
    scannedBy: teacher.id,
    direction: "Check In",
    status: "Present",
    scanMethod: "manual",
  });
  assert.ok(duplicate);
  assert.equal(duplicate?.duplicate, true);

  const history = await storage.getQrAttendanceEvents({ userId: student.id });
  assert.equal(history.length, 1);
  assert.equal(history[0]?.direction, "Check In");

  const deactivated = await storage.setQrProfileActive(student.id, false);
  assert.equal(deactivated?.isActive, false);

  const blocked = await storage.scanQrAttendance({
    token: regenerated.token,
    scannedBy: teacher.id,
    direction: "Check Out",
    scanMethod: "manual",
  });
  assert.equal(blocked, undefined);
});

