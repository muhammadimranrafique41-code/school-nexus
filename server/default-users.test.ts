import assert from "node:assert/strict";
import test from "node:test";
import { defaultSeedUsers, getMissingDefaultUsers } from "./default-users";

test("getMissingDefaultUsers returns every default user when none exist", () => {
  assert.equal(getMissingDefaultUsers([]).length, defaultSeedUsers.length);
});

test("getMissingDefaultUsers filters out existing default emails", () => {
  const missingUsers = getMissingDefaultUsers(["admin@school.edu", "a.rivera@student.edu"]);

  assert.equal(missingUsers.some((user) => user.email === "admin@school.edu"), false);
  assert.equal(missingUsers.some((user) => user.email === "a.rivera@student.edu"), false);
  assert.equal(missingUsers.some((user) => user.email === "s.mitchell@school.edu"), true);
});

test("getMissingDefaultUsers matches emails case-insensitively", () => {
  const missingUsers = getMissingDefaultUsers(["ADMIN@SCHOOL.EDU"]);
  assert.equal(missingUsers.some((user) => user.email === "admin@school.edu"), false);
});