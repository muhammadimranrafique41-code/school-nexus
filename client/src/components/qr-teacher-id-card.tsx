import { Badge } from "@/components/ui/badge";
import { escapeHtml } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

export type TeacherIdCardData = {
  schoolName: string;
  shortName: string;
  motto: string;
  logoUrl?: string;
  teacherName: string;
  designation: string;
  department: string;
  subject: string;
  employeeId: string;
  publicId: string;
  qrUrl: string;
  portraitUrl?: string | null;
  isActive: boolean;
  academicYear: string;
  currentTerm: string;
  authenticityLine: string;
};

function getInitials(value?: string | null) {
  return value?.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "SN";
}

function extractFirstUrlCandidate(value: string) {
  const matches = value.match(/https?:\/\/.+?(?=https?:\/\/|$)/gi) ?? [];

  for (const match of matches) {
    const candidate = match.trim().replace(/[),.;]+$/, "");
    try {
      return new URL(candidate).toString();
    } catch {
      continue;
    }
  }

  return null;
}

export function normalizeTeacherPortraitUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const urlCandidates = trimmed.match(/https?:\/\//gi)?.length && (trimmed.match(/https?:\/\//gi)?.length ?? 0) > 1
    ? [extractFirstUrlCandidate(trimmed)]
    : [trimmed, extractFirstUrlCandidate(trimmed)];

  for (const candidate of urlCandidates) {
    if (!candidate) continue;

    try {
      return new URL(candidate).toString();
    } catch {
      continue;
    }
  }

  return null;
}

function inferImageMimeType(url: string) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".avif")) return "image/avif";
  return null;
}

async function readRemoteImageAsDataUrl(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, credentials: "omit" });
  if (!response.ok) throw new Error(`Failed to load teacher portrait: ${response.status}`);

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  const imageType = contentType?.startsWith("image/") ? contentType : inferImageMimeType(url);
  if (!imageType) throw new Error("Unable to infer teacher portrait image type");

  const blob = new Blob([await response.arrayBuffer()], { type: imageType });

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read teacher portrait data"));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read teacher portrait data"));
    reader.readAsDataURL(blob);
  });
}

export async function resolveTeacherPortraitUrl(rawUrl?: string | null, signal?: AbortSignal) {
  const normalizedUrl = normalizeTeacherPortraitUrl(rawUrl);
  if (!normalizedUrl || typeof window === "undefined") return normalizedUrl;
  if (normalizedUrl.startsWith("data:") || normalizedUrl.startsWith("blob:")) return normalizedUrl;

  const portraitUrl = new URL(normalizedUrl);
  if (portraitUrl.origin === window.location.origin) return normalizedUrl;

  try {
    return await readRemoteImageAsDataUrl(normalizedUrl, signal ?? new AbortController().signal);
  } catch {
    return normalizedUrl;
  }
}

export function useTeacherPortraitUrl(rawUrl?: string | null) {
  const normalizedUrl = useMemo(() => normalizeTeacherPortraitUrl(rawUrl), [rawUrl]);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(normalizedUrl);

  useEffect(() => {
    setResolvedUrl(normalizedUrl);
  }, [normalizedUrl]);

  useEffect(() => {
    if (!normalizedUrl || typeof window === "undefined") return;
    if (normalizedUrl.startsWith("data:") || normalizedUrl.startsWith("blob:")) return;

    const portraitUrl = new URL(normalizedUrl);
    if (portraitUrl.origin === window.location.origin) return;

    const controller = new AbortController();
    let active = true;

    resolveTeacherPortraitUrl(normalizedUrl, controller.signal)
      .then((dataUrl) => {
        if (active) setResolvedUrl(dataUrl);
      })
      .catch(() => {
        if (active) setResolvedUrl(normalizedUrl);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [normalizedUrl]);

  return resolvedUrl;
}

function TeacherPortrait({ src, alt, initials }: { src?: string | null; alt: string; initials: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  if (src && !imageFailed) {
    return (
      <img
        src={src}
        alt={alt}
        className="h-full min-h-[132px] w-full rounded-[1.1rem] object-cover"
        referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div className="grid h-full min-h-[132px] w-full place-items-center rounded-[1.1rem] bg-gradient-to-br from-slate-200 to-emerald-100 text-3xl font-bold text-slate-700">
      {initials}
    </div>
  );
}

export function TeacherIdCardPreview({ card }: { card: TeacherIdCardData }) {
  const initials = getInitials(card.teacherName);

  return (
    <div className="rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-emerald-50/60 p-4 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] sm:p-5">
      <div className="mx-auto w-full max-w-[390px]">
        <div className="relative aspect-[54/86] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_25px_70px_-35px_rgba(15,23,42,0.55)]">
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900" />
          <div className="absolute -right-4 -top-5 h-28 w-28 rounded-full bg-emerald-400/25 blur-2xl" />
          <div className="absolute -left-4 bottom-12 h-24 w-24 rounded-full bg-sky-200/60 blur-2xl" />

          <div className="relative flex h-full flex-col p-5">
            <div className="rounded-[1.4rem] border border-white/15 bg-white/10 p-4 text-white backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {card.logoUrl ? (
                    <img src={card.logoUrl} alt={`${card.shortName} logo`} className="h-11 w-11 rounded-2xl bg-white/10 object-cover p-1.5" />
                  ) : (
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/12 text-sm font-extrabold tracking-[0.2em] text-white">
                      {getInitials(card.shortName)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-200">{card.shortName}</p>
                    <h2 className="line-clamp-2 text-lg font-bold leading-tight">{card.schoolName}</h2>
                  </div>
                </div>
                <div className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-100">
                  Teacher ID
                </div>
              </div>

              <div className="my-3 h-px bg-gradient-to-r from-emerald-300/0 via-emerald-300/80 to-emerald-300/0" />
              <p className="text-[11px] leading-relaxed text-slate-200/90">{card.motto}</p>
            </div>

            <div className="mt-4 grid grid-cols-[112px_1fr] gap-4">
              <div className="rounded-[1.5rem] border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-2.5 shadow-sm">
                <TeacherPortrait src={card.portraitUrl} alt={`${card.teacherName} portrait`} initials={initials} />
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Teacher name</p>
                  <p className="mt-1 font-display text-[1.38rem] font-bold leading-tight text-slate-950">{card.teacherName}</p>
                </div>

                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Designation</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{card.designation}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Department</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{card.department}</p>
              </div>
              <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Employee ID</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{card.employeeId}</p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Subject</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{card.subject}</p>
              </div>
              <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Academic session</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{card.academicYear}</p>
              </div>
            </div>

            <div className="mt-auto rounded-[1.5rem] border border-slate-200 bg-slate-50/90 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">Secure staff attendance credential</p>
                  <p className="mt-1 text-xs text-slate-500">{card.currentTerm} • institution-aligned verification</p>
                </div>
                <Badge variant={card.isActive ? "secondary" : "destructive"}>{card.isActive ? "Active" : "Inactive"}</Badge>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <div className="rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-sm">
                  <img src={card.qrUrl} alt={`${card.teacherName} QR code`} className="h-28 w-28 rounded-lg" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900">Balanced quiet space is preserved for reliable scanning.</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Present the card digitally or in print for authorized staff identity verification and attendance workflows.
                  </p>
                  <div className="mt-3 rounded-xl bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-100">{card.publicId}</div>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-[1rem] border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-[11px] leading-relaxed text-emerald-900">
              {card.authenticityLine}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function buildTeacherIdCardPrintHtml(card: TeacherIdCardData) {
  const initials = getInitials(card.teacherName);
  const portraitUrl = normalizeTeacherPortraitUrl(card.portraitUrl);
  const logoHtml = card.logoUrl
    ? `<img src="${escapeHtml(card.logoUrl)}" alt="${escapeHtml(card.shortName)} logo" class="logo" />`
    : `<div class="logo logo-fallback">${escapeHtml(getInitials(card.shortName))}</div>`;
  const portraitHtml = portraitUrl
    ? `<div class="portrait photo"><img src="${escapeHtml(portraitUrl)}" alt="${escapeHtml(card.teacherName)} portrait" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';" /><div class="portrait-fallback" style="display:none">${escapeHtml(initials)}</div></div>`
    : `<div class="portrait"><div class="portrait-fallback">${escapeHtml(initials)}</div></div>`;

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(card.teacherName)} • ${escapeHtml(card.shortName)} Teacher ID Card</title>
      <style>
        @page { margin: 12mm; }
        * { box-sizing: border-box; }
        html, body {
          margin: 0;
          padding: 0;
          font-family: Inter, Arial, sans-serif;
          background: #e2e8f0;
          color: #0f172a;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16mm;
        }
        .sheet {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .card {
          position: relative;
          overflow: hidden;
          width: 100%;
          max-width: 148mm;
          aspect-ratio: 54 / 86;
          border-radius: 10mm;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          color: #0f172a;
          border: 0.35mm solid rgba(148, 163, 184, 0.44);
          box-shadow: 0 12mm 30mm -16mm rgba(15, 23, 42, 0.45);
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .hero {
          position: absolute;
          inset: 0 0 auto 0;
          height: 72mm;
          background: linear-gradient(145deg, #020617 0%, #0f172a 50%, #065f46 100%);
        }
        .glow {
          position: absolute;
          border-radius: 999px;
          filter: blur(14mm);
          opacity: 0.28;
        }
        .glow-top {
          width: 46mm;
          height: 46mm;
          right: -8mm;
          top: -8mm;
          background: #34d399;
        }
        .glow-bottom {
          width: 38mm;
          height: 38mm;
          left: -6mm;
          bottom: 12mm;
          background: #7dd3fc;
        }
        .content {
          position: relative;
          z-index: 1;
          height: 100%;
          padding: 8mm;
          display: flex;
          flex-direction: column;
          gap: 4mm;
        }
        .header {
          padding: 5mm;
          border-radius: 6mm;
          color: white;
          background: rgba(255, 255, 255, 0.1);
          border: 0.25mm solid rgba(255, 255, 255, 0.14);
          backdrop-filter: blur(6px);
        }
        .header-top, .brand, .qr-top {
          display: flex;
          gap: 3mm;
          align-items: center;
        }
        .header-top, .qr-top {
          justify-content: space-between;
          align-items: flex-start;
        }
        .brand-copy, .identity-copy, .qr-copy {
          min-width: 0;
        }
        .logo {
          width: 13mm;
          height: 13mm;
          border-radius: 3mm;
          object-fit: cover;
          background: rgba(255, 255, 255, 0.16);
          padding: 1.2mm;
        }
        .logo-fallback {
          display: grid;
          place-items: center;
          font-weight: 800;
          font-size: 11px;
          letter-spacing: 0.1em;
        }
        .eyebrow {
          margin: 0;
          font-size: 7px;
          letter-spacing: 0.26em;
          text-transform: uppercase;
          color: rgba(226, 232, 240, 0.92);
        }
        .school {
          margin: 1.1mm 0 0;
          font-size: 16px;
          line-height: 1.12;
          font-weight: 800;
          overflow-wrap: anywhere;
        }
        .type-chip {
          white-space: nowrap;
          border-radius: 999px;
          border: 0.25mm solid rgba(110, 231, 183, 0.42);
          color: #d1fae5;
          padding: 1.4mm 2.8mm;
          font-size: 6.2px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          background: rgba(16, 185, 129, 0.12);
        }
        .rule {
          height: 0.3mm;
          margin: 3mm 0 2.4mm;
          background: linear-gradient(90deg, rgba(110, 231, 183, 0), rgba(110, 231, 183, 0.92), rgba(110, 231, 183, 0));
        }
        .motto {
          margin: 0;
          font-size: 6.8px;
          line-height: 1.55;
          color: rgba(226, 232, 240, 0.9);
          overflow-wrap: anywhere;
        }
        .identity {
          display: grid;
          grid-template-columns: 35mm 1fr;
          gap: 4mm;
          align-items: start;
        }
        .portrait-wrap {
          padding: 2mm;
          border-radius: 5.5mm;
          border: 0.25mm solid rgba(148, 163, 184, 0.34);
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          box-shadow: inset 0 0 0 0.15mm rgba(255, 255, 255, 0.85);
        }
        .portrait {
          width: 100%;
          aspect-ratio: 1 / 1.18;
          border-radius: 4.6mm;
          overflow: hidden;
          display: grid;
          place-items: center;
          background: linear-gradient(145deg, #e2e8f0 0%, #d1fae5 100%);
          color: #334155;
          font-size: 24px;
          font-weight: 800;
        }
        .portrait.photo {
          position: relative;
          background: #e2e8f0;
        }
        .portrait img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .portrait-fallback {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
        }
        .name-label, .field-label {
          margin: 0;
          font-size: 5.9px;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #64748b;
        }
        .name {
          margin: 1.2mm 0 0;
          font-size: 18px;
          line-height: 1.12;
          font-weight: 800;
          letter-spacing: -0.02em;
          overflow-wrap: anywhere;
        }
        .field {
          padding: 3mm 3.2mm;
          border-radius: 4.4mm;
          border: 0.25mm solid rgba(148, 163, 184, 0.28);
          background: rgba(248, 250, 252, 0.9);
        }
        .identity-copy .field {
          margin-top: 2.6mm;
        }
        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 3mm;
        }
        .field-value {
          margin: 1mm 0 0;
          font-size: 7.2px;
          line-height: 1.45;
          font-weight: 700;
          color: #0f172a;
          overflow-wrap: anywhere;
        }
        .qr-panel {
          margin-top: auto;
          padding: 4.2mm;
          border-radius: 6mm;
          border: 0.25mm solid rgba(148, 163, 184, 0.28);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(241, 245, 249, 0.96) 100%);
        }
        .meta-title {
          margin: 0;
          font-size: 6.1px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #334155;
        }
        .meta-subtitle {
          margin: 1mm 0 0;
          font-size: 6.3px;
          color: #64748b;
          overflow-wrap: anywhere;
        }
        .state-chip {
          border-radius: 999px;
          padding: 1.2mm 2.4mm;
          font-size: 5.8px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: ${card.isActive ? "#166534" : "#991b1b"};
          background: ${card.isActive ? "#dcfce7" : "#fee2e2"};
        }
        .qr-row {
          margin-top: 3.4mm;
          display: grid;
          grid-template-columns: 42mm 1fr;
          gap: 4mm;
          align-items: center;
        }
        .qr-box {
          padding: 3.1mm;
          border-radius: 5.2mm;
          background: white;
          border: 0.25mm solid rgba(148, 163, 184, 0.25);
          box-shadow: inset 0 0 0 0.15mm rgba(255, 255, 255, 0.8);
        }
        .qr-box img {
          display: block;
          width: 35.8mm;
          height: 35.8mm;
          border-radius: 2.8mm;
        }
        .qr-copy p {
          margin: 0;
        }
        .copy-title {
          font-size: 7.2px;
          line-height: 1.45;
          font-weight: 700;
          color: #0f172a;
          overflow-wrap: anywhere;
        }
        .copy-body {
          margin-top: 1.4mm;
          font-size: 6.4px;
          line-height: 1.55;
          color: #64748b;
          overflow-wrap: anywhere;
        }
        .card-id {
          margin-top: 2.3mm;
          padding: 1.8mm 2.3mm;
          border-radius: 3.2mm;
          background: #0f172a;
          color: #f8fafc;
          font-size: 6px;
          line-height: 1.4;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          overflow-wrap: anywhere;
        }
        .footer {
          padding: 2.8mm 3.2mm;
          border-radius: 4.8mm;
          border: 0.25mm solid rgba(110, 231, 183, 0.35);
          background: rgba(236, 253, 245, 0.92);
          font-size: 6.2px;
          line-height: 1.55;
          color: #065f46;
          overflow-wrap: anywhere;
        }
        @media print {
          html, body {
            background: white;
          }
          body {
            min-height: auto;
            padding: 0;
            display: block;
          }
          .sheet {
            width: auto;
          }
          .card {
            margin: 0 auto;
            box-shadow: none;
          }
        }
      </style>
    </head>
    <body>
      <main class="sheet">
        <article class="card">
          <div class="hero"></div>
          <div class="glow glow-top"></div>
          <div class="glow glow-bottom"></div>
          <div class="content">
            <section class="header">
              <div class="header-top">
                <div class="brand">
                  ${logoHtml}
                  <div class="brand-copy">
                    <p class="eyebrow">${escapeHtml(card.shortName)}</p>
                    <p class="school">${escapeHtml(card.schoolName)}</p>
                  </div>
                </div>
                <div class="type-chip">Teacher ID</div>
              </div>
              <div class="rule"></div>
              <p class="motto">${escapeHtml(card.motto)}</p>
            </section>

            <section class="identity">
              <div class="portrait-wrap">${portraitHtml}</div>
              <div class="identity-copy">
                <p class="name-label">Teacher Name</p>
                <p class="name">${escapeHtml(card.teacherName)}</p>
                <div class="field">
                  <p class="field-label">Designation</p>
                  <p class="field-value">${escapeHtml(card.designation)}</p>
                </div>
              </div>
            </section>

            <section class="detail-grid">
              <div class="field">
                <p class="field-label">Department</p>
                <p class="field-value">${escapeHtml(card.department)}</p>
              </div>
              <div class="field">
                <p class="field-label">Employee ID</p>
                <p class="field-value">${escapeHtml(card.employeeId)}</p>
              </div>
              <div class="field">
                <p class="field-label">Subject</p>
                <p class="field-value">${escapeHtml(card.subject)}</p>
              </div>
              <div class="field">
                <p class="field-label">Academic Session</p>
                <p class="field-value">${escapeHtml(`${card.academicYear} • ${card.currentTerm}`)}</p>
              </div>
            </section>

            <section class="qr-panel">
              <div class="qr-top">
                <div>
                  <p class="meta-title">Secure Staff Attendance Credential</p>
                  <p class="meta-subtitle">Scan to verify trusted institutional identity on one clean printable page.</p>
                </div>
                <div class="state-chip">${card.isActive ? "Active" : "Inactive"}</div>
              </div>
              <div class="qr-row">
                <div class="qr-box">
                  <img src="${escapeHtml(card.qrUrl)}" alt="${escapeHtml(card.teacherName)} QR code" />
                </div>
                <div class="qr-copy">
                  <p class="copy-title">Balanced quiet space is preserved for dependable scan performance.</p>
                  <p class="copy-body">Present this credential digitally or in print for authorized staff attendance and identity verification workflows.</p>
                  <div class="card-id">${escapeHtml(card.publicId)}</div>
                </div>
              </div>
            </section>

            <footer class="footer">${escapeHtml(card.authenticityLine)}</footer>
          </div>
        </article>
      </main>
      <script>
        const waitForImages = async () => {
          const images = Array.from(document.images);
          await Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          })));
          setTimeout(() => window.print(), 180);
        };
        window.addEventListener('load', waitForImages);
        window.addEventListener('afterprint', () => window.close());
      </script>
    </body>
  </html>`;
}