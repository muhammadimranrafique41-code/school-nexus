import { clsx, type ClassValue } from "clsx"
import { format as formatDateFn } from "date-fns"
import { twMerge } from "tailwind-merge"
import { defaultSchoolSettingsData, type PublicSchoolSettings } from "@shared/settings"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const fallbackPublicSchoolSettings: PublicSchoolSettings = {
  schoolInformation: {
    schoolName: defaultSchoolSettingsData.schoolInformation.schoolName,
    shortName: defaultSchoolSettingsData.schoolInformation.shortName,
    schoolEmail: defaultSchoolSettingsData.schoolInformation.schoolEmail,
    schoolPhone: defaultSchoolSettingsData.schoolInformation.schoolPhone,
    schoolAddress: defaultSchoolSettingsData.schoolInformation.schoolAddress,
    websiteUrl: defaultSchoolSettingsData.schoolInformation.websiteUrl,
    motto: defaultSchoolSettingsData.schoolInformation.motto,
  },
  academicConfiguration: {
    currentAcademicYear: defaultSchoolSettingsData.academicConfiguration.currentAcademicYear,
    currentTerm: defaultSchoolSettingsData.academicConfiguration.currentTerm,
    weekStartsOn: defaultSchoolSettingsData.academicConfiguration.weekStartsOn,
  },
  financialSettings: {
    locale: defaultSchoolSettingsData.financialSettings.locale,
    currencyCode: defaultSchoolSettingsData.financialSettings.currencyCode,
    currencySymbol: defaultSchoolSettingsData.financialSettings.currencySymbol,
    timezone: defaultSchoolSettingsData.financialSettings.timezone,
    dateFormat: defaultSchoolSettingsData.financialSettings.dateFormat,
    invoicePrefix: defaultSchoolSettingsData.financialSettings.invoicePrefix,
    receiptPrefix: defaultSchoolSettingsData.financialSettings.receiptPrefix,
  },
  branding: defaultSchoolSettingsData.branding,
  systemPreferences: {
    enablePublicBranding: defaultSchoolSettingsData.systemPreferences.enablePublicBranding,
    enableDocumentWatermark: defaultSchoolSettingsData.systemPreferences.enableDocumentWatermark,
    maintenanceMode: defaultSchoolSettingsData.systemPreferences.maintenanceMode,
    maintenanceMessage: defaultSchoolSettingsData.systemPreferences.maintenanceMessage,
  },
  documentTemplates: defaultSchoolSettingsData.documentTemplates,
  setup: {
    isComplete: false,
    completionPercentage: 0,
    checklist: [],
  },
}

let cachedPublicSchoolSettings = fallbackPublicSchoolSettings

export function getCachedPublicSchoolSettings() {
  return cachedPublicSchoolSettings
}

export function setCachedPublicSchoolSettings(settings?: PublicSchoolSettings | null) {
  cachedPublicSchoolSettings = settings ?? fallbackPublicSchoolSettings
}

export function formatCurrency(value: number) {
  const settings = getCachedPublicSchoolSettings()

  try {
    return new Intl.NumberFormat(settings.financialSettings.locale, {
      style: "currency",
      currency: settings.financialSettings.currencyCode,
      maximumFractionDigits: 0,
    }).format(value)
  } catch {
    return new Intl.NumberFormat(fallbackPublicSchoolSettings.financialSettings.locale, {
      style: "currency",
      currency: fallbackPublicSchoolSettings.financialSettings.currencyCode,
      maximumFractionDigits: 0,
    }).format(value)
  }
}

export function formatDate(value: string | number | Date, pattern?: string) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return formatDateFn(date, pattern ?? getCachedPublicSchoolSettings().financialSettings.dateFormat)
}

export function applyDocumentBranding(settings?: PublicSchoolSettings | null, pageTitle?: string) {
  if (typeof document === "undefined") return

  const resolved = settings ?? getCachedPublicSchoolSettings()
  const brandName = resolved.systemPreferences.enablePublicBranding
    ? resolved.schoolInformation.shortName || resolved.schoolInformation.schoolName
    : fallbackPublicSchoolSettings.schoolInformation.shortName

  document.title = pageTitle ? `${pageTitle} • ${brandName}` : resolved.branding.headerTitle || brandName

  if (resolved.branding.faviconUrl.trim()) {
    const favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']") || document.createElement("link")
    favicon.rel = "icon"
    favicon.href = resolved.branding.faviconUrl
    if (!favicon.parentNode) document.head.appendChild(favicon)
  }
}

export function calculateGrade(marks: number) {
  if (marks >= 90) return "A"
  if (marks >= 80) return "B"
  if (marks >= 70) return "C"
  if (marks >= 60) return "D"
  return "F"
}

export function paginateItems<T>(items: T[], currentPage: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(Math.max(currentPage, 1), totalPages)
  const start = (safePage - 1) * pageSize

  return {
    currentPage: safePage,
    totalPages,
    pageItems: items.slice(start, start + pageSize),
  }
}

export async function getResponseErrorMessage(res: Response, fallback: string) {
  const text = (await res.text()).trim()
  if (!text) return fallback

  try {
    const parsed = JSON.parse(text) as { message?: string; error?: string }
    return parsed.message || parsed.error || fallback
  } catch {
    return text
  }
}

export function getErrorMessage(error: unknown, fallback = "Something went wrong") {
  if (!(error instanceof Error)) {
    return fallback
  }

  const jsonStart = error.message.indexOf("{")
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(error.message.slice(jsonStart)) as { message?: string; error?: string }
      return parsed.message || parsed.error || error.message
    } catch {
      return error.message || fallback
    }
  }

  return error.message || fallback
}

export function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (rows.length === 0 || typeof document === "undefined") return

  const headers = Object.keys(rows[0])
  const escapeCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header] ?? "")).join(",")),
  ].join("\n")

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

export function openPrintWindow(
  title: string,
  bodyHtml: string,
  options?: { documentType?: "general" | "invoice" | "receipt" | "reportCard" | "certificate"; subtitle?: string },
) {
  if (typeof window === "undefined") return false

  const settings = getCachedPublicSchoolSettings()
  const schoolName = settings.schoolInformation.schoolName
  const contactLine = [settings.schoolInformation.schoolAddress, settings.schoolInformation.schoolPhone, settings.schoolInformation.schoolEmail]
    .filter(Boolean)
    .join(" • ")
  const documentHeader =
    options?.documentType === "invoice"
      ? settings.documentTemplates.invoiceHeader
      : options?.documentType === "receipt"
        ? "Official payment receipt"
        : options?.documentType === "reportCard"
          ? settings.documentTemplates.reportCardHeader
          : options?.documentType === "certificate"
            ? settings.documentTemplates.certificateHeader
            : title
  const watermarkHtml = settings.systemPreferences.enableDocumentWatermark
    ? `<div class="watermark">${escapeHtml(settings.schoolInformation.shortName || schoolName)}</div>`
    : ""

  const printWindow = window.open("", "_blank", "width=1100,height=800")
  if (!printWindow) return false

  try {
    printWindow.document.open()
    printWindow.document.write(`<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 32px; color: #0f172a; }
        h1, h2, h3 { margin: 0 0 12px; }
        p { margin: 0 0 12px; color: #475569; }
        .section { margin-top: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; vertical-align: top; }
        th { background: #f8fafc; }
        .muted { color: #64748b; }
        .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; }
        .header { margin-bottom: 24px; padding-bottom: 18px; border-bottom: 2px solid #e2e8f0; }
        .eyebrow { color: #7c3aed; font-size: 12px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 8px; }
        .watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 72px; font-weight: 800; color: rgba(148, 163, 184, 0.08); transform: rotate(-24deg); pointer-events: none; user-select: none; }
        @media print { body { margin: 18px; } }
      </style>
      <script>
        (() => {
          let didPrint = false;

          const triggerPrint = () => {
            if (didPrint) return;
            didPrint = true;
            window.setTimeout(() => {
              window.focus();
              window.print();
            }, 180);
          };

          if (document.readyState === "complete") {
            triggerPrint();
          } else {
            window.addEventListener("load", triggerPrint, { once: true });
          }

          window.addEventListener("afterprint", () => {
            window.setTimeout(() => window.close(), 120);
          });
        })();
      <\/script>
    </head>
    <body>
      ${watermarkHtml}
      <div class="header">
        <div class="eyebrow">${escapeHtml(settings.branding.headerTitle || schoolName)}</div>
        <h1>${escapeHtml(schoolName)}</h1>
        <p>${escapeHtml(documentHeader)}</p>
        ${options?.subtitle ? `<p class="muted">${escapeHtml(options.subtitle)}</p>` : ""}
        ${contactLine ? `<p class="muted">${escapeHtml(contactLine)}</p>` : ""}
      </div>
      ${bodyHtml}
      <div class="section muted">${escapeHtml(settings.documentTemplates.footerNote)}</div>
    </body>
  </html>`)
    printWindow.document.close()
    printWindow.focus()
    return true
  } catch {
    printWindow.close()
    return false
  }
}
