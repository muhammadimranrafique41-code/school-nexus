import {
  IdCardPortrait,
  normalizeIdCardPortraitUrl,
  resolveIdCardPortraitUrl,
  useIdCardPortraitUrl,
} from "@/components/qr-id-card-portrait";
import { escapeHtml } from "@/lib/utils";
import type { PublicSchoolSettings } from "@shared/settings";

/* ─── Data type ──────────────────────────────────────────────────────────── */
export type StudentIdCardData = {
  schoolName:       string;
  shortName:        string;
  motto:            string;
  logoUrl?:         string;
  studentName:      string;
  className:        string;
  fatherName:       string;
  publicId:         string;
  qrUrl:            string;
  portraitUrl?:     string | null;
  isActive:         boolean;
  academicYear:     string;
  currentTerm:      string;
  authenticityLine: string;
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
export function getInitials(value?: string | null) {
  return value?.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "SN";
}

export function getContactLine(settings?: PublicSchoolSettings | null) {
  return [
    settings?.schoolInformation.schoolAddress,
    settings?.schoolInformation.schoolPhone,
    settings?.schoolInformation.schoolEmail,
  ].filter((v): v is string => Boolean(v?.trim())).join(" • ");
}

export const normalizeStudentPortraitUrl = normalizeIdCardPortraitUrl;
export const resolveStudentPortraitUrl   = resolveIdCardPortraitUrl;
export const useStudentPortraitUrl       = useIdCardPortraitUrl;

/* ══════════════════════════════════════════════════════════════════════════
   REACT PREVIEW  —  Light mode · CR80 ratio · Emerald/Teal theme
   ══════════════════════════════════════════════════════════════════════════ */
export function StudentIdCardPreview({ card }: { card: StudentIdCardData }) {
  const initials = getInitials(card.studentName);

  const W   = 520;
  const RAD = 18;

  return (
    <div className="w-full select-none" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>

      {/* ════════ FRONT CARD ════════ */}
      <div style={{ position:"relative", width:"100%", maxWidth:W, margin:"0 auto" }}>
        {/* ambient glow */}
        <div style={{
          position:"absolute", inset:"10px 24px -4px",
          borderRadius:RAD+4,
          background:"linear-gradient(135deg,#059669,#0d9488)",
          filter:"blur(32px)", opacity:0.2, zIndex:0,
        }}/>

        <div style={{
          position:"relative", zIndex:1,
          width:"100%", aspectRatio:"3.375 / 2.125",
          borderRadius:RAD, overflow:"hidden",
          background:"#ffffff",
          boxShadow:"0 20px 60px -16px rgba(5,150,105,0.2), 0 0 0 1px rgba(13,148,136,0.16)",
        }}>

          {/* ── Header hero band — emerald/teal ── */}
          <div style={{
            position:"absolute", inset:"0 0 auto 0", height:"36%",
            background:"linear-gradient(135deg,#064e3b 0%,#065f46 40%,#047857 70%,#059669 100%)",
          }}/>
          {/* decorative circles */}
          <div style={{ position:"absolute", top:-20, right:-20, width:88, height:88, borderRadius:"50%", background:"rgba(255,255,255,0.07)" }}/>
          <div style={{ position:"absolute", top:8, right:14, width:44, height:44, borderRadius:"50%", background:"rgba(255,255,255,0.06)" }}/>

          {/* dot grid on white area */}
          <svg style={{ position:"absolute",inset:"36% 0 0 0",width:"100%",height:"64%",opacity:0.03,pointerEvents:"none" }}>
            <defs>
              <pattern id="sdGrid" width="14" height="14" patternUnits="userSpaceOnUse">
                <circle cx="7" cy="7" r="0.7" fill="#059669"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#sdGrid)"/>
          </svg>

          {/* ── Accent bars ── */}
          <div style={{ position:"absolute",top:0,bottom:0,left:0,width:4, background:"linear-gradient(180deg,#064e3b,#059669,#064e3b)" }}/>
          <div style={{ position:"absolute",inset:"auto 0 0 0",height:3, background:"linear-gradient(90deg,#92400e,#f59e0b 40%,#fcd34d 50%,#f59e0b 60%,#92400e)" }}/>

          {/* ── MAIN CONTENT ── */}
          <div style={{
            position:"relative", zIndex:5,
            display:"flex", flexDirection:"column", height:"100%",
            padding:"10px 12px 9px 12px",
          }}>

            {/* ── HEADER ROW (on green band) ── */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6, marginBottom:4 }}>
              {/* Logo + school */}
              <div style={{ display:"flex", alignItems:"center", gap:7, minWidth:0 }}>
                {card.logoUrl ? (
                  <img src={card.logoUrl} alt="logo" style={{
                    width:28, height:28, borderRadius:6, objectFit:"contain",
                    background:"rgba(255,255,255,0.15)", padding:2, flexShrink:0,
                  }}/>
                ) : (
                  <div style={{
                    width:28, height:28, borderRadius:6, flexShrink:0,
                    background:"rgba(255,255,255,0.18)", border:"1px solid rgba(255,255,255,0.3)",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:7, fontWeight:900, color:"#ffffff", letterSpacing:"0.06em",
                  }}>
                    {card.shortName.slice(0,3).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth:0 }}>
                  <p style={{ fontSize:7.5, fontWeight:800, color:"rgba(209,250,229,0.9)", letterSpacing:"0.1em", textTransform:"uppercase", lineHeight:1.2, margin:0 }}>
                    {card.shortName}
                  </p>
                  <p style={{ fontSize:6, color:"rgba(167,243,208,0.8)", lineHeight:1.2, margin:0, maxWidth:165, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {card.schoolName}
                  </p>
                </div>
              </div>

              {/* Student chip + status */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, flexShrink:0 }}>
                <div style={{
                  background:"rgba(255,255,255,0.18)", border:"1px solid rgba(255,255,255,0.28)",
                  borderRadius:4, padding:"2px 8px",
                }}>
                  <p style={{ fontSize:6, fontWeight:800, color:"#ffffff", letterSpacing:"0.14em", textTransform:"uppercase", margin:0 }}>
                    Student ID Card
                  </p>
                </div>
                <div style={{
                  background: card.isActive ? "rgba(16,185,129,0.22)" : "rgba(239,68,68,0.22)",
                  border:`1px solid ${card.isActive ? "rgba(16,185,129,0.55)" : "rgba(239,68,68,0.55)"}`,
                  borderRadius:4, padding:"1.5px 6px",
                }}>
                  <p style={{
                    fontSize:5.5, fontWeight:800, margin:0, letterSpacing:"0.12em", textTransform:"uppercase",
                    color: card.isActive ? "#059669" : "#dc2626",
                  }}>
                    {card.isActive ? "● Active" : "● Inactive"}
                  </p>
                </div>
              </div>
            </div>

            {/* ── BODY ── */}
            <div style={{ display:"flex", flex:1, gap:9, alignItems:"stretch", marginTop:2 }}>

              {/* Portrait column */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, width:68, flexShrink:0 }}>
                <div style={{
                  width:64, height:72, borderRadius:8, overflow:"hidden",
                  border:"2.5px solid #059669",
                  background:"#ecfdf5",
                  boxShadow:"0 4px 12px rgba(5,150,105,0.18)",
                  flexShrink:0, marginTop:-2,
                }}>
                  <IdCardPortrait
                    src={card.portraitUrl}
                    alt={`${card.studentName} portrait`}
                    initials={initials}
                    fallbackClassName="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-100"
                  />
                </div>

                {/* Class chip */}
                <div style={{
                  width:"100%", background:"#ecfdf5", border:"1px solid #a7f3d0",
                  borderRadius:4, padding:"2px 4px", textAlign:"center",
                }}>
                  <p style={{ fontSize:4.5, color:"#059669", fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", margin:0 }}>CLASS</p>
                  <p style={{ fontSize:6.5, color:"#064e3b", fontWeight:900, margin:0 }}>
                    {card.className}
                  </p>
                </div>
              </div>

              {/* Details column */}
              <div style={{ display:"flex", flexDirection:"column", justifyContent:"space-between", flex:1, minWidth:0, paddingTop:2 }}>
                <div>
                  <p style={{
                    fontSize:12.5, fontWeight:900, color:"#0f172a", lineHeight:1.15,
                    letterSpacing:"-0.01em", margin:0,
                    overflow:"hidden", display:"-webkit-box",
                    WebkitLineClamp:2, WebkitBoxOrient:"vertical",
                  }}>
                    {card.studentName}
                  </p>
                  <div style={{ height:1, margin:"3px 0", background:"linear-gradient(90deg,#a7f3d0,transparent)" }}/>
                </div>

                {/* Info rows */}
                <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {[
                    { label:"Father",  value: card.fatherName  },
                    { label:"Term",    value: card.currentTerm },
                    { label:"Year",    value: card.academicYear },
                  ].map(row => (
                    <div key={row.label} style={{ display:"flex", alignItems:"baseline", gap:4 }}>
                      <span style={{ fontSize:5, color:"#64748b", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", width:42, flexShrink:0 }}>
                        {row.label}
                      </span>
                      <span style={{ fontSize:6.5, color:"#1e293b", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Public ID pill */}
                <div style={{
                  display:"inline-flex", alignItems:"center", gap:4, marginTop:3,
                  background:"#f0fdf4", border:"1px solid #bbf7d0",
                  borderRadius:4, padding:"2px 6px", alignSelf:"flex-start",
                }}>
                  <span style={{ fontSize:4.5, color:"#64748b", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase" }}>ID</span>
                  <span style={{ fontSize:6, color:"#065f46", fontFamily:"monospace", fontWeight:700 }}>{card.publicId}</span>
                </div>
              </div>

              {/* QR column — gold ring */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, width:76, flexShrink:0, paddingTop:2 }}>
                {/* Gold outer ring */}
                <div style={{
                  padding:3, borderRadius:10,
                  background:"linear-gradient(135deg,#d97706,#f59e0b 50%,#fcd34d 80%,#f59e0b)",
                  boxShadow:"0 4px 16px rgba(245,158,11,0.42), 0 0 0 1px rgba(245,158,11,0.2)",
                }}>
                  <div style={{ background:"#ffffff", borderRadius:8, padding:3 }}>
                    {card.qrUrl ? (
                      <img src={card.qrUrl} alt="QR Code" style={{ width:62, height:62, display:"block", borderRadius:3 }}/>
                    ) : (
                      <div style={{ width:62, height:62, display:"flex", alignItems:"center", justifyContent:"center", background:"#f8fafc", borderRadius:3 }}>
                        <p style={{ fontSize:7, color:"#94a3b8", textAlign:"center", margin:0 }}>QR</p>
                      </div>
                    )}
                  </div>
                </div>
                <p style={{ fontSize:5, color:"#64748b", textAlign:"center", letterSpacing:"0.04em", margin:0, lineHeight:1.3 }}>
                  Scan to verify
                </p>
                {/* Holographic strip */}
                <div style={{
                  width:"100%", height:4, borderRadius:2,
                  background:"linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899,#f59e0b,#10b981,#3b82f6,#6366f1)",
                  opacity:0.7,
                }}/>
              </div>

            </div>

            {/* ── FOOTER ── */}
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              borderTop:"1px solid #e2e8f0", paddingTop:4, marginTop:4,
            }}>
              <p style={{ fontSize:4.5, color:"#94a3b8", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", paddingRight:8, margin:0 }}>
                {card.authenticityLine}
              </p>
              <p style={{ fontSize:3.5, color:"#cbd5e1", letterSpacing:"0.18em", whiteSpace:"nowrap", margin:0 }}>
                OFFICIAL • SECURE • VERIFIED
              </p>
            </div>

          </div>
        </div>
      </div>

      {/* ════════ BACK CARD ════════ */}
      <div style={{ position:"relative", width:"100%", maxWidth:W, margin:"12px auto 0" }}>
        <div style={{
          position:"relative", zIndex:1,
          width:"100%", aspectRatio:"3.375 / 2.125",
          borderRadius:RAD, overflow:"hidden",
          background:"linear-gradient(150deg,#f8fafc 0%,#f0fdf4 100%)",
          boxShadow:"0 10px 36px -12px rgba(5,150,105,0.14), 0 0 0 1px rgba(13,148,136,0.1)",
        }}>
          <div style={{ position:"absolute", inset:"0 0 auto 0", height:4, background:"linear-gradient(90deg,#064e3b,#059669 40%,#10b981 50%,#059669 60%,#064e3b)" }}/>
          <div style={{ position:"absolute", inset:"auto 0 0 0", height:3, background:"linear-gradient(90deg,#92400e,#f59e0b 50%,#92400e)" }}/>
          <div style={{ position:"absolute", top:0, bottom:0, left:0, width:4, background:"linear-gradient(180deg,#064e3b,#059669,#064e3b)" }}/>
          <div style={{
            position:"absolute", top:22, left:0, right:0, height:26,
            background:"linear-gradient(180deg,#1e293b,#334155 50%,#1e293b)",
            borderTop:"0.5px solid rgba(0,0,0,0.08)", borderBottom:"0.5px solid rgba(0,0,0,0.08)",
          }}/>

          <div style={{
            position:"relative", zIndex:5,
            height:"100%", display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center",
            padding:"0 22px", gap:5,
          }}>
            <p style={{ fontSize:24, fontWeight:900, letterSpacing:"0.2em", textTransform:"uppercase", color:"rgba(5,150,105,0.08)", margin:0, lineHeight:1 }}>{card.shortName}</p>
            <p style={{ fontSize:5.5, color:"#64748b", lineHeight:1.7, textAlign:"center", maxWidth:310, margin:0, letterSpacing:"0.02em" }}>
              This card is the property of <strong style={{ color:"#334155" }}>{card.schoolName}</strong>.
              If found, please return to the school office.
              Unauthorised use is strictly prohibited. This card is non-transferable.
            </p>
            <div style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"flex-end", paddingLeft:10, paddingRight:10, marginTop:2 }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ width:100, height:1, background:"#cbd5e1", marginBottom:3 }}/>
                <p style={{ fontSize:4.5, color:"#94a3b8", letterSpacing:"0.08em", textTransform:"uppercase", margin:0 }}>Authorised Signature</p>
              </div>
              <div style={{ textAlign:"center" }}>
                <div style={{ width:80, height:1, background:"#cbd5e1", marginBottom:3 }}/>
                <p style={{ fontSize:4.5, color:"#94a3b8", letterSpacing:"0.08em", textTransform:"uppercase", margin:0 }}>{card.academicYear}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PRINT HTML — HD 300 DPI · CMYK-safe · Light mode
   ══════════════════════════════════════════════════════════════════════════ */
export function buildStudentIdCardPrintHtml(card: StudentIdCardData): string {
  const initials    = getInitials(card.studentName);
  const portraitUrl = normalizeStudentPortraitUrl(card.portraitUrl);
  const logoInitials = card.shortName.slice(0, 3).toUpperCase();

  const logoHtml = card.logoUrl
    ? `<img src="${escapeHtml(card.logoUrl)}" alt="${escapeHtml(card.shortName)} logo" class="logo-img" />`
    : `<div class="logo-fallback">${escapeHtml(logoInitials)}</div>`;

  const portraitHtml = portraitUrl
    ? `<div class="portrait photo">
        <img src="${escapeHtml(portraitUrl)}" alt="${escapeHtml(card.studentName)}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
        <div class="portrait-initials" style="display:none">${escapeHtml(initials)}</div>
       </div>`
    : `<div class="portrait">
        <div class="portrait-initials">${escapeHtml(initials)}</div>
       </div>`;

  const activeColor  = card.isActive ? "#059669" : "#dc2626";
  const activeBg     = card.isActive ? "#d1fae5" : "#fee2e2";
  const activeBorder = card.isActive ? "#6ee7b7" : "#fca5a5";
  const activeLabel  = card.isActive ? "● Active" : "● Inactive";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(card.studentName)} — ${escapeHtml(card.shortName)} Student ID Card</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  @page {
    size: A4 portrait;
    margin: 14mm 16mm;
  }

  html, body {
    font-family: 'Montserrat', 'Segoe UI', Arial, sans-serif;
    background: #e8f4f0;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }

  body {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 24px 0;
    gap: 4px;
  }

  .page-title {
    font-size: 8.5pt;
    font-weight: 700;
    color: #64748b;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin-bottom: 14px;
  }

  .side-label {
    font-size: 7pt;
    font-weight: 700;
    color: #94a3b8;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    align-self: flex-start;
    margin-bottom: 5px;
    margin-top: 14px;
  }

  /* ── Card shell ── */
  .card, .card-back {
    position: relative;
    width: 343px;
    height: 216px;
    border-radius: 13px;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .card {
    background: #ffffff;
    box-shadow: 0 16px 48px -12px rgba(5,150,105,0.18), 0 0 0 1px rgba(13,148,136,0.14);
  }

  /* Green hero band */
  .hero-band {
    position: absolute; inset: 0 0 auto 0; height: 38%;
    background: linear-gradient(135deg, #064e3b 0%, #065f46 40%, #047857 70%, #059669 100%);
  }
  .hero-circle-1 { position: absolute; top: -18px; right: -18px; width: 80px; height: 80px; border-radius: 50%; background: rgba(255,255,255,0.07); }
  .hero-circle-2 { position: absolute; top: 8px; right: 14px; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.06); }

  /* Dot grid */
  .dot-grid {
    position: absolute; inset: 38% 0 0 0;
    background-image: radial-gradient(circle, rgba(5,150,105,0.06) 1px, transparent 1px);
    background-size: 14px 14px;
  }

  /* Accent bars */
  .stripe-left   { position: absolute; top: 0; bottom: 0; left: 0; width: 4px; background: linear-gradient(180deg,#064e3b,#059669,#064e3b); }
  .stripe-bottom { position: absolute; inset: auto 0 0 0; height: 3px; background: linear-gradient(90deg,#92400e,#f59e0b 40%,#fcd34d 50%,#f59e0b 60%,#92400e); }

  /* ── Card inner ── */
  .card-inner {
    position: relative; z-index: 5;
    display: flex; flex-direction: column;
    height: 100%;
    padding: 10px 12px 9px 11px;
  }

  /* Header */
  .card-header { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px; }
  .logo-wrap   { display: flex; align-items: center; gap: 7px; }
  .logo-img    { width: 26px; height: 26px; border-radius: 5px; object-fit: contain; background: rgba(255,255,255,0.18); padding: 2px; flex-shrink: 0; }
  .logo-fallback {
    width: 26px; height: 26px; border-radius: 5px; flex-shrink: 0;
    background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.32);
    display: flex; align-items: center; justify-content: center;
    font-size: 7px; font-weight: 900; color: #ffffff; letter-spacing: 0.06em;
  }
  .school-short { font-size: 7.5px; font-weight: 800; color: rgba(209,250,229,0.9); letter-spacing: 0.1em; text-transform: uppercase; line-height: 1.2; margin: 0; }
  .school-full  { font-size: 6px; color: rgba(167,243,208,0.8); line-height: 1.2; margin: 0; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .badge-group  { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }
  .id-badge     { font-size: 6px; font-weight: 800; color: #ffffff; letter-spacing: 0.14em; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.28); }
  .status-badge {
    font-size: 5.5px; font-weight: 800; letter-spacing: 0.12em;
    text-transform: uppercase; padding: 1.5px 6px; border-radius: 4px;
    color: ${activeColor}; background: ${activeBg}; border: 1px solid ${activeBorder};
  }

  /* Body */
  .card-body { display: flex; gap: 9px; flex: 1; align-items: stretch; margin-top: 2px; }

  /* Portrait */
  .portrait-col { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 67px; flex-shrink: 0; }
  .portrait-frame {
    width: 63px; height: 71px; border-radius: 8px; overflow: hidden;
    border: 2.5px solid #059669; background: #ecfdf5;
    box-shadow: 0 4px 12px rgba(5,150,105,0.18); flex-shrink: 0;
    margin-top: -2px;
  }
  .portrait           { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(145deg,#d1fae5,#ccfbf1); }
  .portrait.photo     { position: relative; }
  .portrait img       { width: 100%; height: 100%; object-fit: cover; display: block; }
  .portrait-initials  { font-size: 20px; font-weight: 900; color: #059669; line-height: 1; }
  .class-chip          { width: 100%; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 4px; padding: 2px 4px; text-align: center; }
  .class-chip-lbl      { font-size: 4.5px; color: #059669; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin: 0; }
  .class-chip-val      { font-size: 6.5px; color: #064e3b; font-weight: 900; margin: 0; }

  /* Details */
  .details-col { display: flex; flex-direction: column; justify-content: space-between; flex: 1; min-width: 0; padding-top: 2px; }
  .student-name { font-size: 12.5pt; font-weight: 900; color: #0f172a; line-height: 1.15; letter-spacing: -0.01em; margin: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .divider      { height: 1px; background: linear-gradient(90deg,#a7f3d0,transparent); margin: 3px 0; }
  .info-row     { display: flex; align-items: baseline; gap: 4px; margin-bottom: 2px; }
  .info-lbl     { font-size: 5px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; width: 42px; flex-shrink: 0; }
  .info-val     { font-size: 6.5px; color: #1e293b; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pid-chip     { display: inline-flex; align-items: center; gap: 4px; margin-top: 3px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px; padding: 2px 6px; }
  .pid-chip-lbl { font-size: 4.5px; color: #64748b; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .pid-chip-val { font-size: 6px; color: #065f46; font-family: 'Roboto Mono','Courier New',monospace; font-weight: 700; }

  /* QR */
  .qr-col   { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 76px; flex-shrink: 0; padding-top: 2px; }
  .qr-ring  { padding: 3px; border-radius: 10px; background: linear-gradient(135deg,#d97706,#f59e0b 50%,#fcd34d 80%,#f59e0b); box-shadow: 0 4px 14px rgba(245,158,11,0.38); }
  .qr-white { background: #ffffff; border-radius: 8px; padding: 3px; }
  .qr-white img { display: block; width: 62px; height: 62px; border-radius: 3px; }
  .qr-label { font-size: 5px; color: #64748b; text-align: center; letter-spacing: 0.04em; line-height: 1.3; }
  .holo-strip { width: 100%; height: 4px; border-radius: 2px; background: linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899,#f59e0b,#10b981,#3b82f6,#6366f1); opacity: 0.7; }

  /* Footer */
  .card-footer { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 4px; margin-top: 4px; }
  .auth-line   { font-size: 4.5px; color: #94a3b8; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; }
  .micro-print { font-size: 3.5px; color: #cbd5e1; letter-spacing: 0.18em; white-space: nowrap; }

  /* ── CARD BACK ── */
  .card-back {
    background: linear-gradient(150deg,#f8fafc 0%,#f0fdf4 100%);
    box-shadow: 0 10px 32px -12px rgba(5,150,105,0.12), 0 0 0 1px rgba(13,148,136,0.09);
    margin-top: 2px;
  }
  .back-stripe-top    { position: absolute; inset: 0 0 auto 0; height: 4px; background: linear-gradient(90deg,#064e3b,#059669 40%,#10b981 50%,#059669 60%,#064e3b); }
  .back-stripe-bottom { position: absolute; inset: auto 0 0 0; height: 3px; background: linear-gradient(90deg,#92400e,#f59e0b 50%,#92400e); }
  .back-stripe-left   { position: absolute; top: 0; bottom: 0; left: 0; width: 4px; background: linear-gradient(180deg,#064e3b,#059669,#064e3b); }
  .back-mag {
    position: absolute; top: 22px; left: 0; right: 0; height: 26px;
    background: linear-gradient(180deg,#1e293b,#334155 50%,#1e293b);
    border-top: 0.5px solid rgba(0,0,0,0.07); border-bottom: 0.5px solid rgba(0,0,0,0.07);
  }
  .back-inner {
    position: relative; z-index: 5;
    height: 100%; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 0 22px; gap: 5px;
  }
  .back-watermark { font-size: 26pt; font-weight: 900; color: rgba(5,150,105,0.08); letter-spacing: 0.2em; text-transform: uppercase; line-height: 1; }
  .back-terms     { font-size: 5.5px; color: #64748b; line-height: 1.7; text-align: center; max-width: 298px; letter-spacing: 0.02em; }
  .back-terms strong { color: #334155; font-weight: 700; }
  .sig-row   { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; margin-top: 3px; }
  .sig-block { text-align: center; }
  .sig-line  { height: 1px; background: #cbd5e1; margin-bottom: 3px; }
  .sig-lbl   { font-size: 4.5px; color: #94a3b8; letter-spacing: 0.08em; text-transform: uppercase; }

  @media print {
    body { background: #fff; padding: 0; min-height: auto; display: block; }
    .page-title { display: none; }
    .side-label { margin-left: 4px; }
    .card, .card-back { box-shadow: none; }
  }
</style>
</head>
<body>

<p class="page-title">${escapeHtml(card.schoolName)} — Official Student Credential</p>

<!-- ══ FRONT ══ -->
<p class="side-label">▲ Front</p>
<div class="card">
  <div class="hero-band"></div>
  <div class="hero-circle-1"></div>
  <div class="hero-circle-2"></div>
  <div class="dot-grid"></div>
  <div class="stripe-left"></div>
  <div class="stripe-bottom"></div>

  <div class="card-inner">

    <div class="card-header">
      <div class="logo-wrap">
        ${logoHtml}
        <div>
          <p class="school-short">${escapeHtml(card.shortName)}</p>
          <p class="school-full">${escapeHtml(card.schoolName)}</p>
        </div>
      </div>
      <div class="badge-group">
        <div class="id-badge">Student ID Card</div>
        <div class="status-badge">${escapeHtml(activeLabel)}</div>
      </div>
    </div>

    <div class="card-body">

      <div class="portrait-col">
        <div class="portrait-frame">${portraitHtml}</div>
        <div class="class-chip">
          <p class="class-chip-lbl">Class</p>
          <p class="class-chip-val">${escapeHtml(card.className)}</p>
        </div>
      </div>

      <div class="details-col">
        <p class="student-name">${escapeHtml(card.studentName)}</p>
        <div class="divider"></div>
        <div class="info-row"><span class="info-lbl">Father</span><span class="info-val">${escapeHtml(card.fatherName)}</span></div>
        <div class="info-row"><span class="info-lbl">Term</span><span class="info-val">${escapeHtml(card.currentTerm)}</span></div>
        <div class="info-row"><span class="info-lbl">Year</span><span class="info-val">${escapeHtml(card.academicYear)}</span></div>
        <div class="pid-chip">
          <span class="pid-chip-lbl">ID</span>
          <span class="pid-chip-val">${escapeHtml(card.publicId)}</span>
        </div>
      </div>

      <div class="qr-col">
        <div class="qr-ring">
          <div class="qr-white">
            ${card.qrUrl
              ? `<img src="${escapeHtml(card.qrUrl)}" alt="QR Code" />`
              : `<div style="width:62px;height:62px;display:flex;align-items:center;justify-content:center;background:#f8fafc;border-radius:3px;"><p style="font-size:7px;color:#94a3b8;text-align:center;">QR Code</p></div>`}
          </div>
        </div>
        <p class="qr-label">Scan to verify</p>
        <div class="holo-strip"></div>
      </div>

    </div>

    <div class="card-footer">
      <p class="auth-line">${escapeHtml(card.authenticityLine)}</p>
      <p class="micro-print">OFFICIAL • SECURE • VERIFIED</p>
    </div>

  </div>
</div>

<!-- ══ BACK ══ -->
<p class="side-label">▼ Back</p>
<div class="card-back">
  <div class="back-stripe-top"></div>
  <div class="back-stripe-bottom"></div>
  <div class="back-stripe-left"></div>
  <div class="back-mag"></div>

  <div class="back-inner">
    <p class="back-watermark">${escapeHtml(card.shortName)}</p>
    <p class="back-terms">
      This card is the property of <strong>${escapeHtml(card.schoolName)}</strong>.
      If found, please return to the school office.
      Unauthorised use is strictly prohibited. This card is non-transferable and must be
      worn visibly at all times while on school premises.
    </p>
    <div class="sig-row">
      <div class="sig-block">
        <div class="sig-line" style="width:108px;"></div>
        <p class="sig-lbl">Authorised Signature</p>
      </div>
      <div class="sig-block">
        <div class="sig-line" style="width:80px;"></div>
        <p class="sig-lbl">${escapeHtml(card.academicYear)}</p>
      </div>
    </div>
  </div>
</div>

<script>
  let printed = false;
  const waitImg = img => img.complete
    ? Promise.resolve()
    : new Promise(res => { img.addEventListener('load', res, {once:true}); img.addEventListener('error', res, {once:true}); });

  const printWhenReady = async () => {
    if (printed) return;
    printed = true;
    await Promise.all(Array.from(document.images).map(async img => {
      await waitImg(img);
      if (img.naturalWidth > 0 && typeof img.decode === 'function') {
        try { await img.decode(); } catch {}
      }
    }));
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    setTimeout(() => window.print(), 150);
  };

  if (document.readyState === 'complete') { printWhenReady(); }
  else { window.addEventListener('load', printWhenReady, {once:true}); }
  window.addEventListener('afterprint', () => window.close());
</script>
</body>
</html>`;
}