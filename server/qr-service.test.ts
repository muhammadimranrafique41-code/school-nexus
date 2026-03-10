import test from "node:test";
import assert from "node:assert/strict";

import {
  getAttendanceDate,
  decryptQrToken,
  encryptQrToken,
  generateQrPublicId,
  generateQrToken,
  hashQrToken,
  isValidQrTokenFormat,
} from "./qr-service.js";

test("generateQrToken creates a valid School Nexus QR token", () => {
  const publicId = generateQrPublicId();
  const token = generateQrToken(publicId);

  assert.equal(isValidQrTokenFormat(token), true);
  assert.match(token, new RegExp(`^SNXQR\\.${publicId}\\.`));
});

test("encryptQrToken round-trips the original token", () => {
  const token = generateQrToken();
  const encrypted = encryptQrToken(token);

  assert.notEqual(encrypted, token);
  assert.equal(decryptQrToken(encrypted), token);
});

test("hashQrToken is deterministic", () => {
  const token = generateQrToken();

  assert.equal(hashQrToken(token), hashQrToken(token));
});

test("decryptQrToken rejects malformed payloads", () => {
  assert.throws(() => decryptQrToken("not-a-valid-payload"), /Invalid QR token payload/);
});

test("isValidQrTokenFormat rejects malformed tokens", () => {
  assert.equal(isValidQrTokenFormat("SNXQR.invalid.token"), false);
  assert.equal(isValidQrTokenFormat("bad-token"), false);
});

test("getAttendanceDate returns an ISO calendar date", () => {
  assert.equal(getAttendanceDate(new Date("2026-03-10T16:45:00.000Z")), "2026-03-10");
});
