import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const QR_TOKEN_PREFIX = "SNXQR";
const AES_ALGORITHM = "aes-256-cbc";

function getQrSecret(): string {
  return process.env.QR_TOKEN_SECRET || process.env.SESSION_SECRET || "school-nexus-qr-secret";
}

function getQrKey(): Buffer {
  return createHash("sha256").update(getQrSecret()).digest();
}

export function hashQrToken(token: string): string {
  return createHash("sha256").update(token.trim()).digest("hex");
}

export function generateQrPublicId(): string {
  return randomBytes(6).toString("hex");
}

export function generateQrToken(publicId = generateQrPublicId()): string {
  return `${QR_TOKEN_PREFIX}.${publicId}.${randomBytes(18).toString("hex")}`;
}

export function encryptQrToken(token: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(AES_ALGORITHM, getQrKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);

  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptQrToken(payload: string): string {
  const [ivHex, encryptedHex] = payload.split(":");

  if (!ivHex || !encryptedHex) {
    throw new Error("Invalid QR token payload");
  }

  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = createDecipheriv(AES_ALGORITHM, getQrKey(), iv);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function isValidQrTokenFormat(token: string): boolean {
  return /^SNXQR\.[a-f0-9]{12}\.[a-f0-9]{36}$/i.test(token.trim());
}

export function getAttendanceDate(value = new Date()): string {
  return value.toISOString().slice(0, 10);
}
