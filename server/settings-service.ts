import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import {
  cloneSchoolSettingsData,
  defaultSchoolSettingsData,
  publicSchoolSettingsSchema,
  schoolSettingsDataSchema,
  type PublicSchoolSettings,
  type SchoolSettingsAuditAction,
  type SchoolSettingsCategoryKey,
  type SchoolSettingsCompletionItem,
  type SchoolSettingsData,
} from "@shared/settings";

const secretFieldPaths = [
  "notificationSettings.smtpPassword",
  "notificationSettings.smsApiKey",
] as const;

const secretFieldSet = new Set<string>(secretFieldPaths);
const encryptedPrefix = "enc::";

function deriveEncryptionKey() {
  return createHash("sha256")
    .update(process.env.SETTINGS_ENCRYPTION_KEY || process.env.SESSION_SECRET || "school-nexus-settings")
    .digest();
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${encryptedPrefix}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(value: string) {
  if (!value.startsWith(encryptedPrefix)) return value;
  try {
    const [, payload] = value.split(encryptedPrefix);
    const [ivBase64, tagBase64, encryptedBase64] = payload.split(":");
    const decipher = createDecipheriv("aes-256-gcm", deriveEncryptionKey(), Buffer.from(ivBase64, "base64"));
    decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}

function setNestedValue(target: Record<string, any>, path: string, value: string) {
  const parts = path.split(".");
  let current: Record<string, any> = target;
  for (const part of parts.slice(0, -1)) current = current[part];
  current[parts[parts.length - 1]] = value;
}

function getNestedValue(target: Record<string, any>, path: string) {
  return path.split(".").reduce<any>((current, part) => current?.[part], target);
}

function serializeAuditValue(fieldPath: string, value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (secretFieldSet.has(fieldPath)) return String(value).trim() ? "••••••••" : "";
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  return serialized.length > 180 ? `${serialized.slice(0, 177)}...` : serialized;
}

const completionRules: Array<{ key: string; label: string; category: SchoolSettingsCategoryKey; check: (data: SchoolSettingsData) => boolean }> = [
  { key: "school-name", label: "School name", category: "schoolInformation", check: (data) => data.schoolInformation.schoolName.trim().length > 1 },
  { key: "school-contact", label: "Primary contact", category: "schoolInformation", check: (data) => Boolean(data.schoolInformation.schoolEmail.trim() || data.schoolInformation.schoolPhone.trim()) },
  { key: "school-address", label: "School address", category: "schoolInformation", check: (data) => data.schoolInformation.schoolAddress.trim().length > 4 },
  { key: "academic-year", label: "Academic year", category: "academicConfiguration", check: (data) => data.academicConfiguration.currentAcademicYear.trim().length > 3 },
  { key: "academic-levels", label: "Academic levels", category: "academicConfiguration", check: (data) => data.academicConfiguration.academicLevels.length > 0 },
  { key: "currency", label: "Currency and locale", category: "financialSettings", check: (data) => data.financialSettings.currencyCode.trim().length === 3 && data.financialSettings.locale.trim().length > 1 },
  { key: "branding-title", label: "Header title", category: "branding", check: (data) => data.branding.headerTitle.trim().length > 1 },
  { key: "login-copy", label: "Login welcome copy", category: "branding", check: (data) => data.branding.loginWelcomeTitle.trim().length > 1 },
  { key: "documents", label: "Document headers", category: "documentTemplates", check: (data) => Boolean(data.documentTemplates.invoiceHeader.trim() && data.documentTemplates.reportCardHeader.trim() && data.documentTemplates.certificateHeader.trim()) },
  { key: "notifications", label: "Notification sender", category: "notificationSettings", check: (data) => Boolean(data.notificationSettings.senderName.trim() && data.notificationSettings.replyToEmail.trim()) },
];

export function decryptSchoolSettingsData(data: unknown) {
  const parsed = schoolSettingsDataSchema.parse(data || defaultSchoolSettingsData);
  const clone = cloneSchoolSettingsData(parsed);
  for (const path of secretFieldPaths) {
    const current = getNestedValue(clone as Record<string, any>, path);
    setNestedValue(clone as Record<string, any>, path, typeof current === "string" ? decryptSecret(current) : "");
  }
  return clone;
}

export function encryptSchoolSettingsData(data: SchoolSettingsData) {
  const clone = cloneSchoolSettingsData(data);
  for (const path of secretFieldPaths) {
    const current = getNestedValue(clone as Record<string, any>, path);
    setNestedValue(clone as Record<string, any>, path, typeof current === "string" && current.trim() ? encryptSecret(current.trim()) : "");
  }
  return clone;
}

export function buildSchoolSettingsCompletion(data: SchoolSettingsData) {
  const checklist: SchoolSettingsCompletionItem[] = completionRules.map((rule) => ({
    key: rule.key,
    label: rule.label,
    category: rule.category,
    complete: rule.check(data),
  }));
  const completed = checklist.filter((item) => item.complete).length;
  const completionPercentage = checklist.length === 0 ? 100 : Math.round((completed / checklist.length) * 100);
  return {
    checklist,
    completionPercentage,
    isComplete: checklist.every((item) => item.complete),
  };
}

export function buildPublicSchoolSettings(data: SchoolSettingsData): PublicSchoolSettings {
  const completion = buildSchoolSettingsCompletion(data);
  return publicSchoolSettingsSchema.parse({
    schoolInformation: data.schoolInformation,
    academicConfiguration: {
      currentAcademicYear: data.academicConfiguration.currentAcademicYear,
      currentTerm: data.academicConfiguration.currentTerm,
      weekStartsOn: data.academicConfiguration.weekStartsOn,
    },
    financialSettings: {
      locale: data.financialSettings.locale,
      currencyCode: data.financialSettings.currencyCode,
      currencySymbol: data.financialSettings.currencySymbol,
      timezone: data.financialSettings.timezone,
      dateFormat: data.financialSettings.dateFormat,
      invoicePrefix: data.financialSettings.invoicePrefix,
      receiptPrefix: data.financialSettings.receiptPrefix,
    },
    branding: data.branding,
    systemPreferences: {
      enablePublicBranding: data.systemPreferences.enablePublicBranding,
      enableDocumentWatermark: data.systemPreferences.enableDocumentWatermark,
      maintenanceMode: data.systemPreferences.maintenanceMode,
      maintenanceMessage: data.systemPreferences.maintenanceMessage,
    },
    documentTemplates: data.documentTemplates,
    setup: completion,
  });
}

export function diffSchoolSettings(previousData: SchoolSettingsData, nextData: SchoolSettingsData, action: SchoolSettingsAuditAction, changeSummary?: string) {
  const auditEntries: Array<{
    action: SchoolSettingsAuditAction;
    category?: SchoolSettingsCategoryKey;
    fieldPath?: string;
    previousValue?: string | null;
    nextValue?: string | null;
    changeSummary?: string;
  }> = [];

  function visit(path: string, previousValue: unknown, nextValue: unknown) {
    if (typeof previousValue === "object" && previousValue !== null && typeof nextValue === "object" && nextValue !== null && !Array.isArray(previousValue) && !Array.isArray(nextValue)) {
      const keys = new Set([...Object.keys(previousValue as Record<string, unknown>), ...Object.keys(nextValue as Record<string, unknown>)]);
      for (const key of Array.from(keys)) visit(path ? `${path}.${key}` : key, (previousValue as Record<string, unknown>)[key], (nextValue as Record<string, unknown>)[key]);
      return;
    }

    const prevSerialized = JSON.stringify(previousValue ?? null);
    const nextSerialized = JSON.stringify(nextValue ?? null);
    if (prevSerialized === nextSerialized) return;

    const [topLevel] = path.split(".");
    auditEntries.push({
      action,
      category: topLevel as SchoolSettingsCategoryKey,
      fieldPath: path,
      previousValue: serializeAuditValue(path, previousValue),
      nextValue: serializeAuditValue(path, nextValue),
      changeSummary,
    });
  }

  visit("", previousData, nextData);
  return auditEntries;
}

export function getSafeSchoolSettingsDefaults() {
  return cloneSchoolSettingsData(defaultSchoolSettingsData);
}
