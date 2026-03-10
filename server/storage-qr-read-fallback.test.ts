import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { qrAttendanceEvents, qrProfiles, users, type User } from "../shared/schema.js";

const rosterUsers: User[] = [
  { id: 1, name: "Admin User", email: "admin@school.edu", password: "secret", role: "admin", subject: null, className: null },
  { id: 2, name: "Ava Teacher", email: "teacher@school.edu", password: "secret", role: "teacher", subject: "Mathematics", className: null },
];

const missingRelationError = { code: "42P01" };

mock.module("./db.js", {
  namedExports: {
    db: {
      select() {
        return {
          from(table: unknown) {
            if (table === users) {
              return Promise.resolve(rosterUsers);
            }

            if (table === qrProfiles || table === qrAttendanceEvents) {
              return Promise.reject(missingRelationError);
            }

            throw new Error("Unexpected table access in test");
          },
        };
      },
    },
  },
});

const { storage } = await import("./storage.js");

test("QR read methods degrade to empty results when QR tables are not migrated", async () => {
  const profiles = await storage.getQrProfiles();
  const events = await storage.getQrAttendanceEvents({ attendanceDate: "2026-03-10" });

  assert.deepEqual(profiles, []);
  assert.deepEqual(events, []);
});