import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { escapeHtml } from "@/lib/utils";
import type { PublicSchoolSettings } from "@shared/settings";

export type StudentIdCardData = {
  schoolName: string;
  shortName: string;
  motto: string;
  logoUrl?: string;
  studentName: string;
  className: string;
  fatherName: string;
  publicId: string;
  qrUrl: string;
  portraitUrl?: string | null;
  isActive: boolean;
  academicYear: string;
  currentTerm: string;
  authenticityLine: string;
};

export function getInitials(value?: string | null) {
  return value?.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "SN";
}

export function getContactLine(settings?: PublicSchoolSettings | null) {
  return [
    settings?.schoolInformation.schoolAddress,
    settings?.schoolInformation.schoolPhone,
    settings?.schoolInformation.schoolEmail,
  ].filter((value): value is string => Boolean(value?.trim())).join(" • ");
}

export function StudentIdCardPreview({ card }: { card: StudentIdCardData }) {
  const initials = getInitials(card.studentName);

  return (
    <div className="rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-violet-50/50 p-4 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.45)] sm:p-5">
      <div className="mx-auto w-full max-w-[390px]">
        <div className="relative aspect-[54/86] overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_25px_70px_-35px_rgba(15,23,42,0.55)]">
          <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-br from-slate-950 via-slate-900 to-violet-900" />
          <div className="absolute -right-4 -top-5 h-28 w-28 rounded-full bg-fuchsia-400/25 blur-2xl" />
          <div className="absolute -left-4 bottom-12 h-24 w-24 rounded-full bg-violet-200/60 blur-2xl" />

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
                <div className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-100">
                  Student ID
                </div>
              </div>

              <div className="my-3 h-px bg-gradient-to-r from-amber-300/0 via-amber-300/80 to-amber-300/0" />
              <p className="text-[11px] leading-relaxed text-slate-200/90">{card.motto}</p>
            </div>

            <div className="mt-4 grid grid-cols-[112px_1fr] gap-4">
              <div className="rounded-[1.5rem] border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-2.5 shadow-sm">
                <Avatar className="h-full min-h-[132px] w-full rounded-[1.1rem] border border-slate-200 bg-slate-100">
                  <AvatarImage src={card.portraitUrl ?? undefined} alt={`${card.studentName} portrait`} className="object-cover" />
                  <AvatarFallback className="rounded-[1.1rem] bg-gradient-to-br from-slate-200 to-violet-100 text-3xl font-bold text-slate-700">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Student name</p>
                  <p className="mt-1 font-display text-[1.38rem] font-bold leading-tight text-slate-950">{card.studentName}</p>
                </div>

                <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Father&apos;s Name</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{card.fatherName}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Class</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{card.className}</p>
              </div>
              <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">Academic session</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{card.academicYear}</p>
              </div>
            </div>

            <div className="mt-auto rounded-[1.5rem] border border-slate-200 bg-slate-50/90 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600">Secure attendance credential</p>
                  <p className="mt-1 text-xs text-slate-500">{card.currentTerm} • optimized for scan accuracy</p>
                </div>
                <Badge variant={card.isActive ? "secondary" : "destructive"}>{card.isActive ? "Active" : "Inactive"}</Badge>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <div className="rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-sm">
                  <img src={card.qrUrl} alt={`${card.studentName} QR code`} className="h-28 w-28 rounded-lg" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900">Balanced quiet space is preserved for reliable scanning.</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">
                    Present the card digitally or in print for authorized identity verification and attendance workflows.
                  </p>
                  <div className="mt-3 rounded-xl bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-100">{card.publicId}</div>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-[1rem] border border-amber-200 bg-amber-50/90 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
              {card.authenticityLine}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function buildStudentIdCardPrintHtml(card: StudentIdCardData) {
  const initials = getInitials(card.studentName);
  const logoHtml = card.logoUrl
    ? `<img src="${escapeHtml(card.logoUrl)}" alt="${escapeHtml(card.shortName)} logo" class="logo" />`
    : `<div class="logo logo-fallback">${escapeHtml(getInitials(card.shortName))}</div>`;
  const portraitHtml = card.portraitUrl
    ? `<div class="portrait photo"><img src="${escapeHtml(card.portraitUrl)}" alt="${escapeHtml(card.studentName)} portrait" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';" /><div class="portrait-fallback" style="display:none">${escapeHtml(initials)}</div></div>`
    : `<div class="portrait"><div class="portrait-fallback">${escapeHtml(initials)}</div></div>`;

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(card.studentName)} • ${escapeHtml(card.shortName)} ID Card</title>
      <style>
        @page { size: 54mm 86mm; margin: 0; }
        * { box-sizing: border-box; } html, body { margin: 0; padding: 0; font-family: Inter, Arial, sans-serif; background: #e2e8f0; }
        body { min-height: 100vh; display: grid; place-items: center; padding: 12mm; }
        .card { position: relative; overflow: hidden; width: 54mm; min-height: 86mm; border-radius: 7mm; background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); color: #0f172a; border: 0.35mm solid rgba(148,163,184,0.45); box-shadow: 0 8mm 20mm -10mm rgba(15,23,42,0.42); }
        .hero { position: absolute; inset: 0 0 auto 0; height: 28mm; background: linear-gradient(145deg, #020617 0%, #172554 58%, #5b21b6 100%); }
        .glow { position: absolute; border-radius: 999px; filter: blur(10mm); opacity: 0.28; } .glow-top { width: 28mm; height: 28mm; right: -6mm; top: -5mm; background: #f472b6; } .glow-bottom { width: 24mm; height: 24mm; left: -5mm; bottom: 8mm; background: #a78bfa; }
        .content { position: relative; z-index: 1; padding: 4mm; display: flex; flex-direction: column; min-height: 86mm; }
        .header { padding: 3.2mm; border-radius: 4.5mm; color: white; background: rgba(255,255,255,0.09); border: 0.25mm solid rgba(255,255,255,0.14); backdrop-filter: blur(4px); }
        .header-top, .brand, .qr-top, .qr-row { display: flex; gap: 2.6mm; align-items: center; } .header-top, .qr-top { justify-content: space-between; } .brand, .qr-copy { min-width: 0; }
        .logo { width: 8mm; height: 8mm; border-radius: 2.2mm; object-fit: cover; background: rgba(255,255,255,0.16); } .logo-fallback { display: grid; place-items: center; font-weight: 800; font-size: 8px; letter-spacing: 0.08em; }
        .eyebrow { margin: 0; font-size: 5.3px; letter-spacing: 0.24em; text-transform: uppercase; color: rgba(226,232,240,0.92); } .school { margin: 0.8mm 0 0; font-size: 10px; line-height: 1.15; font-weight: 800; }
        .type-chip { white-space: nowrap; border-radius: 999px; border: 0.25mm solid rgba(251,191,36,0.42); color: #fef3c7; padding: 1mm 2mm; font-size: 4.9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; background: rgba(251,191,36,0.12); }
        .rule { height: 0.25mm; margin: 2.4mm 0 2mm; background: linear-gradient(90deg, rgba(251,191,36,0), rgba(251,191,36,0.92), rgba(251,191,36,0)); } .motto { margin: 0; font-size: 5.5px; line-height: 1.5; color: rgba(226,232,240,0.88); }
        .identity { display: grid; grid-template-columns: 18mm 1fr; gap: 3mm; margin-top: 3mm; align-items: start; } .portrait-wrap { padding: 1.5mm; border-radius: 4.5mm; border: 0.25mm solid rgba(148,163,184,0.35); background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); }
        .portrait { width: 100%; aspect-ratio: 1 / 1.18; border-radius: 3.6mm; overflow: hidden; display: grid; place-items: center; background: linear-gradient(145deg, #e2e8f0 0%, #ddd6fe 100%); color: #334155; font-size: 14px; font-weight: 800; }
        .portrait.photo { position: relative; background: #e2e8f0; } .portrait img { width: 100%; height: 100%; object-fit: cover; display: block; } .portrait-fallback { width: 100%; height: 100%; display: grid; place-items: center; }
        .name-label, .field-label { margin: 0; font-size: 5px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: #64748b; } .name { margin: 1mm 0 0; font-size: 10.8px; line-height: 1.16; font-weight: 800; }
        .field { margin-top: 2mm; padding: 2mm 2.2mm; border-radius: 3.2mm; border: 0.25mm solid rgba(148,163,184,0.28); background: rgba(248,250,252,0.88); } .field-value { margin: 0.9mm 0 0; font-size: 6.3px; line-height: 1.35; font-weight: 700; color: #0f172a; }
        .field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2mm; margin-top: 2mm; } .qr-panel { margin-top: auto; padding: 2.8mm; border-radius: 4.5mm; border: 0.25mm solid rgba(148,163,184,0.28); background: rgba(248,250,252,0.92); }
        .meta-title { margin: 0; font-size: 5.2px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: #334155; } .meta-subtitle { margin: 0.8mm 0 0; font-size: 5.4px; color: #64748b; }
        .state-chip { border-radius: 999px; padding: 1mm 2mm; font-size: 5px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: ${card.isActive ? "#166534" : "#991b1b"}; background: ${card.isActive ? "#dcfce7" : "#fee2e2"}; }
        .qr-box { padding: 2.1mm; border-radius: 3.6mm; background: white; border: 0.25mm solid rgba(148,163,184,0.25); box-shadow: inset 0 0 0 0.15mm rgba(255,255,255,0.8); } .qr-box img { display: block; width: 19.5mm; height: 19.5mm; }
        .qr-copy p { margin: 0; } .qr-copy .copy-title { font-size: 5.7px; line-height: 1.5; font-weight: 700; color: #0f172a; } .qr-copy .copy-body { margin-top: 1mm; font-size: 5.4px; line-height: 1.45; color: #64748b; }
        .card-id { margin-top: 2mm; padding: 1.4mm 1.8mm; border-radius: 2.8mm; background: #0f172a; color: #f8fafc; font-size: 5.2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
        .footer { margin-top: 2.4mm; padding: 2.2mm 2.4mm; border-radius: 3.6mm; border: 0.25mm solid rgba(251,191,36,0.35); background: rgba(255,251,235,0.9); font-size: 5.2px; line-height: 1.45; color: #92400e; }
        @media print { html, body { background: white; } body { padding: 0; min-height: auto; } .card { box-shadow: none; } }
      </style>
    </head>
    <body>
      <div class="card"><div class="hero"></div><div class="glow glow-top"></div><div class="glow glow-bottom"></div><div class="content">
        <div class="header"><div class="header-top"><div class="brand">${logoHtml}<div><p class="eyebrow">${escapeHtml(card.shortName)}</p><p class="school">${escapeHtml(card.schoolName)}</p></div></div><div class="type-chip">Student ID</div></div><div class="rule"></div><p class="motto">${escapeHtml(card.motto)}</p></div>
        <div class="identity"><div class="portrait-wrap">${portraitHtml}</div><div><p class="name-label">Student name</p><p class="name">${escapeHtml(card.studentName)}</p><div class="field"><p class="field-label">Father's Name</p><p class="field-value">${escapeHtml(card.fatherName)}</p></div></div></div>
        <div class="field-grid"><div class="field"><p class="field-label">Class</p><p class="field-value">${escapeHtml(card.className)}</p></div><div class="field"><p class="field-label">Academic Session</p><p class="field-value">${escapeHtml(`${card.academicYear} • ${card.currentTerm}`)}</p></div></div>
        <div class="qr-panel"><div class="qr-top"><div><p class="meta-title">Secure attendance credential</p><p class="meta-subtitle">Scan to verify school identity</p></div><div class="state-chip">${card.isActive ? "Active" : "Inactive"}</div></div><div class="qr-row"><div class="qr-box"><img src="${escapeHtml(card.qrUrl)}" alt="${escapeHtml(card.studentName)} QR code" /></div><div class="qr-copy"><p class="copy-title">Balanced quiet space is preserved for reliable scanning.</p><p class="copy-body">Present this credential digitally or in print for authorized attendance workflows.</p><div class="card-id">${escapeHtml(card.publicId)}</div></div></div></div>
        <div class="footer">${escapeHtml(card.authenticityLine)}</div>
      </div></div>
      <script>
        const waitForImages = async () => {
          const images = Array.from(document.images);
          await Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          })));
          setTimeout(() => window.print(), 120);
        };
        window.addEventListener('load', waitForImages);
        window.addEventListener('afterprint', () => window.close());
      </script>
    </body>
  </html>`;
}