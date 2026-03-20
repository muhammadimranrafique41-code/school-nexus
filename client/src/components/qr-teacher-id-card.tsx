import {
  IdCardPortrait,
  normalizeIdCardPortraitUrl,
  resolveIdCardPortraitUrl,
  useIdCardPortraitUrl,
} from "@/components/qr-id-card-portrait";
import { escapeHtml } from "@/lib/utils";

/* ─── Data type ──────────────────────────────────────────────────────────── */
export type TeacherIdCardData = {
  schoolName:       string;
  shortName:        string;
  motto:            string;
  logoUrl?:         string;
  teacherName:      string;
  fatherName?:      string;          // optional — teachers may not have this on file
  designation:      string;
  department:       string;
  subject:          string;
  employeeId:       string;
  publicId:         string;
  qrUrl:            string;
  portraitUrl?:     string | null;
  isActive:         boolean;
  academicYear:     string;
  currentTerm:      string;
  authenticityLine: string;
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function getInitials(value?: string | null) {
  return (
    value?.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "SN"
  );
}

export const normalizeTeacherPortraitUrl = normalizeIdCardPortraitUrl;
export const resolveTeacherPortraitUrl   = resolveIdCardPortraitUrl;
export const useTeacherPortraitUrl       = useIdCardPortraitUrl;

/* ══════════════════════════════════════════════════════════════════════════
   REACT PREVIEW  —  Light mode · CR80 card ratio · Blue/Indigo theme
   ══════════════════════════════════════════════════════════════════════════ */
export function TeacherIdCardPreview({ card }: { card: TeacherIdCardData }) {
  const initials = getInitials(card.teacherName);

  /* ── shared dimension tokens ── */
  const W   = 520;   // maxWidth px
  const RAD = 18;    // border-radius px

  return (
    <div className="w-full select-none" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>

      {/* ════════ FRONT CARD ════════ */}
      <div style={{ position: "relative", width: "100%", maxWidth: W, margin: "0 auto" }}>
        {/* ambient shadow glow */}
        <div style={{
          position: "absolute", inset: "10px 24px -4px",
          borderRadius: RAD + 4,
          background: "linear-gradient(135deg,#3b82f6,#6366f1)",
          filter: "blur(32px)", opacity: 0.22, zIndex: 0,
        }}/>

        <div style={{
          position: "relative", zIndex: 1,
          width: "100%", aspectRatio: "3.375 / 2.125",
          borderRadius: RAD,
          overflow: "hidden",
          background: "#ffffff",
          boxShadow: "0 20px 60px -16px rgba(30,58,138,0.22), 0 0 0 1px rgba(99,102,241,0.18)",
        }}>

          {/* ── Header hero band ── */}
          <div style={{
            position: "absolute", inset: "0 0 auto 0", height: "36%",
            background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 45%, #2563eb 70%, #3b82f6 100%)",
          }}/>
          {/* decorative circle (top-right) */}
          <div style={{
            position: "absolute", top: -20, right: -20,
            width: 88, height: 88, borderRadius: "50%",
            background: "rgba(255,255,255,0.07)",
          }}/>
          <div style={{
            position: "absolute", top: 8, right: 14,
            width: 44, height: 44, borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
          }}/>

          {/* ── Security micropattern overlay (subtlest on white area) ── */}
          <svg style={{ position:"absolute",inset: "36% 0 0 0",width:"100%",height:"64%",opacity:0.025,pointerEvents:"none" }}>
            <defs>
              <pattern id="tcLightGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="0.7" fill="#1d4ed8"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#tcLightGrid)"/>
          </svg>

          {/* ── Blue left accent bar ── */}
          <div style={{
            position:"absolute", top:0, bottom:0, left:0, width:4,
            background:"linear-gradient(180deg,#1e3a8a,#3b82f6,#1e3a8a)",
          }}/>
          {/* ── Gold bottom stripe ── */}
          <div style={{
            position:"absolute", inset:"auto 0 0 0", height:3,
            background:"linear-gradient(90deg,#92400e,#f59e0b 40%,#fcd34d 50%,#f59e0b 60%,#92400e)",
          }}/>

          {/* ── MAIN CONTENT ── */}
          <div style={{
            position:"relative", zIndex:5,
            display:"flex", flexDirection:"column", height:"100%",
            padding:"10px 12px 9px 12px",
          }}>

            {/* ── HEADER ROW (on blue band) ── */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:6, marginBottom:4 }}>
              {/* Logo + school name */}
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
                  <p style={{ fontSize:7.5, fontWeight:800, color:"rgba(219,234,254,0.9)", letterSpacing:"0.1em", textTransform:"uppercase", lineHeight:1.2, margin:0 }}>
                    {card.shortName}
                  </p>
                  <p style={{ fontSize:6, color:"rgba(191,219,254,0.8)", lineHeight:1.2, margin:0, maxWidth:165, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {card.schoolName}
                  </p>
                </div>
              </div>

              {/* STAFF identity chip + status */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, flexShrink:0 }}>
                <div style={{
                  background:"rgba(255,255,255,0.18)", border:"1px solid rgba(255,255,255,0.28)",
                  borderRadius:4, padding:"2px 8px",
                }}>
                  <p style={{ fontSize:6, fontWeight:800, color:"#ffffff", letterSpacing:"0.14em", textTransform:"uppercase", margin:0 }}>
                    Staff ID Card
                  </p>
                </div>
                <div style={{
                  background: card.isActive ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                  border:`1px solid ${card.isActive ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)"}`,
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

            {/* ── BODY (white area) ── */}
            <div style={{ display:"flex", flex:1, gap:9, alignItems:"stretch", marginTop:2 }}>

              {/* Portrait column */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, width:68, flexShrink:0 }}>
                {/* Photo frame — pulls up into the blue band */}
                <div style={{
                  width:64, height:72, borderRadius:8, overflow:"hidden",
                  border:"2.5px solid #3b82f6",
                  background:"#f1f5f9",
                  boxShadow:"0 4px 12px rgba(30,58,138,0.18)",
                  flexShrink:0,
                  marginTop:-2,
                }}>
                  <IdCardPortrait
                    src={card.portraitUrl}
                    alt={`${card.teacherName} portrait`}
                    initials={initials}
                    fallbackClassName="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-100"
                  />
                </div>

                {/* Employee ID chip */}
                <div style={{
                  width:"100%",
                  background:"#eff6ff",
                  border:"1px solid #bfdbfe",
                  borderRadius:4, padding:"2px 4px", textAlign:"center",
                }}>
                  <p style={{ fontSize:4.5, color:"#1d4ed8", fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", margin:0 }}>EMP ID</p>
                  <p style={{ fontSize:6, color:"#1e3a8a", fontWeight:900, margin:0, fontFamily:"monospace" }}>
                    {card.employeeId.slice(0,12)}
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
                    {card.teacherName}
                  </p>
                  <p style={{ fontSize:7, fontWeight:700, color:"#1d4ed8", marginTop:1, letterSpacing:"0.04em", textTransform:"uppercase" }}>
                    {card.designation}
                  </p>
                  <div style={{ height:1, margin:"3px 0", background:"linear-gradient(90deg,#bfdbfe 0%,transparent 100%)" }}/>
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                  {[
                    { label:"Dept",    value: card.department },
                    { label:"Subject", value: card.subject    },
                    ...(card.fatherName ? [{ label:"Father", value: card.fatherName }] : []),
                    { label:"Term",    value: card.currentTerm  },
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
                  background:"#f1f5f9", border:"1px solid #cbd5e1",
                  borderRadius:4, padding:"2px 6px", alignSelf:"flex-start",
                }}>
                  <span style={{ fontSize:4.5, color:"#64748b", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase" }}>ID</span>
                  <span style={{ fontSize:6, color:"#334155", fontFamily:"monospace", fontWeight:700 }}>{card.publicId}</span>
                </div>
              </div>

              {/* QR Code column — hero gold ring */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, width:76, flexShrink:0, paddingTop:2 }}>
                {/* Gold ring */}
                <div style={{
                  padding:3, borderRadius:10,
                  background:"linear-gradient(135deg,#d97706,#f59e0b 50%,#fcd34d 80%,#f59e0b)",
                  boxShadow:"0 4px 16px rgba(245,158,11,0.4), 0 0 0 1px rgba(245,158,11,0.2)",
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
              borderTop:"1px solid #e2e8f0",
              paddingTop:4, marginTop:4,
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
          background:"linear-gradient(150deg,#f8fafc 0%,#f1f5f9 100%)",
          boxShadow:"0 10px 36px -12px rgba(30,58,138,0.15), 0 0 0 1px rgba(99,102,241,0.12)",
        }}>
          {/* Blue top stripe */}
          <div style={{ position:"absolute", inset:"0 0 auto 0", height:4, background:"linear-gradient(90deg,#1e3a8a,#2563eb 40%,#3b82f6 50%,#2563eb 60%,#1e3a8a)" }}/>
          {/* Gold bottom stripe */}
          <div style={{ position:"absolute", inset:"auto 0 0 0", height:3, background:"linear-gradient(90deg,#92400e,#f59e0b 50%,#92400e)" }}/>
          <div style={{ position:"absolute", top:0, bottom:0, left:0, width:4, background:"linear-gradient(180deg,#1e3a8a,#3b82f6,#1e3a8a)" }}/>

          {/* Magnetic stripe */}
          <div style={{
            position:"absolute", top:22, left:0, right:0, height:26,
            background:"linear-gradient(180deg,#1e293b 0%,#334155 50%,#1e293b 100%)",
            borderTop:"0.5px solid rgba(0,0,0,0.08)", borderBottom:"0.5px solid rgba(0,0,0,0.08)",
          }}/>

          {/* Back content */}
          <div style={{
            position:"relative", zIndex:5,
            height:"100%", display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center",
            padding:"0 22px", gap:5,
          }}>
            <p style={{
              fontSize:24, fontWeight:900, letterSpacing:"0.2em", textTransform:"uppercase",
              color:"rgba(99,102,241,0.08)", margin:0, lineHeight:1,
            }}>{card.shortName}</p>

            <p style={{
              fontSize:5.5, color:"#64748b", lineHeight:1.7,
              textAlign:"center", maxWidth:310, margin:0, letterSpacing:"0.02em",
            }}>
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
export function buildTeacherIdCardPrintHtml(card: TeacherIdCardData): string {
  const initials     = getInitials(card.teacherName);
  const portraitUrl  = normalizeTeacherPortraitUrl(card.portraitUrl);
  const logoInitials = card.shortName.slice(0, 3).toUpperCase();

  const logoHtml = card.logoUrl
    ? `<img src="${escapeHtml(card.logoUrl)}" alt="${escapeHtml(card.shortName)} logo" class="logo-img" />`
    : `<div class="logo-fallback">${escapeHtml(logoInitials)}</div>`;

  const portraitHtml = portraitUrl
    ? `<div class="portrait photo">
        <img src="${escapeHtml(portraitUrl)}" alt="${escapeHtml(card.teacherName)}"
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
        <div class="portrait-initials" style="display:none">${escapeHtml(initials)}</div>
       </div>`
    : `<div class="portrait">
        <div class="portrait-initials">${escapeHtml(initials)}</div>
       </div>`;

  const activeColor  = card.isActive ? "#1d4ed8" : "#dc2626";
  const activeBg     = card.isActive ? "#dbeafe" : "#fee2e2";
  const activeBorder = card.isActive ? "#93c5fd" : "#fca5a5";
  const activeLabel  = card.isActive ? "● Active" : "● Inactive";

  const fatherRow = card.fatherName
    ? `<div class="info-row"><span class="info-lbl">Father</span><span class="info-val">${escapeHtml(card.fatherName)}</span></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(card.teacherName)} — ${escapeHtml(card.shortName)} Staff ID Card</title>
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
    background: #e8ecf4;
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
    box-shadow: 0 16px 48px -12px rgba(30,58,138,0.2), 0 0 0 1px rgba(99,102,241,0.15);
  }

  /* Blue hero band */
  .hero-band {
    position: absolute; inset: 0 0 auto 0; height: 38%;
    background: linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 45%, #2563eb 70%, #3b82f6 100%);
  }
  .hero-circle-1 {
    position: absolute; top: -18px; right: -18px;
    width: 80px; height: 80px; border-radius: 50%;
    background: rgba(255,255,255,0.07);
  }
  .hero-circle-2 {
    position: absolute; top: 8px; right: 14px;
    width: 40px; height: 40px; border-radius: 50%;
    background: rgba(255,255,255,0.06);
  }

  /* Dot grid on white area */
  .dot-grid {
    position: absolute; inset: 38% 0 0 0;
    background-image: radial-gradient(circle, rgba(30,58,138,0.07) 1px, transparent 1px);
    background-size: 14px 14px;
  }

  /* Accent bars */
  .stripe-left   { position: absolute; top: 0; bottom: 0; left: 0; width: 4px; background: linear-gradient(180deg,#1e3a8a,#3b82f6,#1e3a8a); }
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
  .school-short { font-size: 7.5px; font-weight: 800; color: rgba(219,234,254,0.9); letter-spacing: 0.1em; text-transform: uppercase; line-height: 1.2; margin: 0; }
  .school-full  { font-size: 6px; color: rgba(191,219,254,0.8); line-height: 1.2; margin: 0; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

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
    border: 2.5px solid #3b82f6; background: #f1f5f9;
    box-shadow: 0 4px 12px rgba(30,58,138,0.18); flex-shrink: 0;
    margin-top: -2px;
  }
  .portrait           { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: linear-gradient(145deg,#dbeafe,#e0e7ff); }
  .portrait.photo     { position: relative; }
  .portrait img       { width: 100%; height: 100%; object-fit: cover; display: block; }
  .portrait-initials  { font-size: 20px; font-weight: 900; color: #1d4ed8; line-height: 1; }
  .emp-chip            { width: 100%; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; padding: 2px 4px; text-align: center; }
  .emp-chip-lbl        { font-size: 4.5px; color: #1d4ed8; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin: 0; }
  .emp-chip-val        { font-size: 6px; color: #1e3a8a; font-weight: 900; margin: 0; font-family: 'Roboto Mono','Courier New',monospace; }

  /* Details */
  .details-col { display: flex; flex-direction: column; justify-content: space-between; flex: 1; min-width: 0; padding-top: 2px; }
  .teacher-name { font-size: 12.5pt; font-weight: 900; color: #0f172a; line-height: 1.15; letter-spacing: -0.01em; margin: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .designation  { font-size: 7px; font-weight: 700; color: #1d4ed8; margin: 1px 0 0; letter-spacing: 0.04em; text-transform: uppercase; }
  .divider      { height: 1px; background: linear-gradient(90deg,#bfdbfe,transparent); margin: 3px 0; }
  .info-row     { display: flex; align-items: baseline; gap: 4px; margin-bottom: 2px; }
  .info-lbl     { font-size: 5px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; width: 42px; flex-shrink: 0; }
  .info-val     { font-size: 6.5px; color: #1e293b; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pid-chip     { display: inline-flex; align-items: center; gap: 4px; margin-top: 3px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 2px 6px; }
  .pid-chip-lbl { font-size: 4.5px; color: #64748b; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .pid-chip-val { font-size: 6px; color: #334155; font-family: 'Roboto Mono','Courier New',monospace; font-weight: 700; }

  /* QR */
  .qr-col   { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 76px; flex-shrink: 0; padding-top: 2px; }
  .qr-ring  { padding: 3px; border-radius: 10px; background: linear-gradient(135deg,#d97706,#f59e0b 50%,#fcd34d 80%,#f59e0b); box-shadow: 0 4px 14px rgba(245,158,11,0.38); }
  .qr-white { background: #ffffff; border-radius: 8px; padding: 3px; }
  .qr-white img { display: block; width: 62px; height: 62px; border-radius: 3px; }
  .qr-label { font-size: 5px; color: #64748b; text-align: center; letter-spacing: 0.04em; line-height: 1.3; }
  .holo-strip { width: 100%; height: 4px; border-radius: 2px; background: linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899,#f59e0b,#10b981,#3b82f6,#6366f1); opacity: 0.7; }

  /* Footer */
  .card-footer  { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 4px; margin-top: 4px; }
  .auth-line    { font-size: 4.5px; color: #94a3b8; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; }
  .micro-print  { font-size: 3.5px; color: #cbd5e1; letter-spacing: 0.18em; white-space: nowrap; }

  /* ── CARD BACK ── */
  .card-back {
    background: linear-gradient(150deg,#f8fafc 0%,#f1f5f9 100%);
    box-shadow: 0 10px 32px -12px rgba(30,58,138,0.14), 0 0 0 1px rgba(99,102,241,0.1);
    margin-top: 2px;
  }
  .back-stripe-top    { position: absolute; inset: 0 0 auto 0; height: 4px; background: linear-gradient(90deg,#1e3a8a,#2563eb 40%,#3b82f6 50%,#2563eb 60%,#1e3a8a); }
  .back-stripe-bottom { position: absolute; inset: auto 0 0 0; height: 3px; background: linear-gradient(90deg,#92400e,#f59e0b 50%,#92400e); }
  .back-stripe-left   { position: absolute; top: 0; bottom: 0; left: 0; width: 4px; background: linear-gradient(180deg,#1e3a8a,#3b82f6,#1e3a8a); }
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
  .back-watermark { font-size: 26pt; font-weight: 900; color: rgba(99,102,241,0.08); letter-spacing: 0.2em; text-transform: uppercase; line-height: 1; }
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

<p class="page-title">${escapeHtml(card.schoolName)} — Official Staff Credential</p>

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
        <div class="id-badge">Staff ID Card</div>
        <div class="status-badge">${escapeHtml(activeLabel)}</div>
      </div>
    </div>

    <div class="card-body">

      <div class="portrait-col">
        <div class="portrait-frame">${portraitHtml}</div>
        <div class="emp-chip">
          <p class="emp-chip-lbl">Emp ID</p>
          <p class="emp-chip-val">${escapeHtml(card.employeeId.slice(0,12))}</p>
        </div>
      </div>

      <div class="details-col">
        <p class="teacher-name">${escapeHtml(card.teacherName)}</p>
        <p class="designation">${escapeHtml(card.designation)}</p>
        <div class="divider"></div>
        <div class="info-row"><span class="info-lbl">Dept</span><span class="info-val">${escapeHtml(card.department)}</span></div>
        <div class="info-row"><span class="info-lbl">Subject</span><span class="info-val">${escapeHtml(card.subject)}</span></div>
        ${fatherRow}
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