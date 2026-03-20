import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { TeacherIdCardPreview, type TeacherIdCardData, useTeacherPortraitUrl } from "@/components/qr-teacher-id-card";
import { getContactLine } from "@/components/qr-student-id-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  invalidateQrAttendanceQueries,
  submitQrAttendanceScan,
  type QrScanInput,
  type QrScanPayload,
  useMyQrCard,
  useQrAttendanceHistory,
  useScanQrAttendance,
} from "@/hooks/use-qr-attendance";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import {
  enqueueOfflineQrAttendanceScan,
  isRecentQrScanDuplicate,
  markOfflineQrAttendanceScanError,
  readOfflineQrAttendanceQueue,
  removeOfflineQrAttendanceScan,
  type QueuedQrAttendanceScan,
} from "@/lib/qr-attendance-offline";
import { buildQrImageUrl, copyToClipboard } from "@/lib/qr";
import { cn, formatDate, getErrorMessage } from "@/lib/utils";
import { api } from "@shared/routes";
import {
  Camera, CheckCircle2, Copy, ExternalLink, Loader2,
  QrCode, RefreshCcw, ScanLine, Shield, Smartphone,
  Wifi, WifiOff, XCircle, AlertTriangle, Clock,
} from "lucide-react";
import { Link } from "wouter";
import { z } from "zod";

/* ─── types ──────────────────────────────────────────────────────── */
type QrHistoryEvent = NonNullable<z.infer<(typeof api.qrAttendance.history.responses)[200]>["data"]>["events"][number];
type ScannerMode = "camera" | "manual";
type CameraStatus = "idle" | "starting" | "ready" | "unsupported" | "denied" | "error";
type FeedbackTone = "success" | "warning" | "error" | "neutral";
type ScanFeedback = { tone: FeedbackTone; title: string; description: string };
type RecentQrScan = { token: string; direction: QrScanPayload["direction"]; at: number };
type BarcodeDetectorResult = { rawValue?: string };
type BarcodeDetectorInstance = { detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]> };
type BarcodeDetectorConstructor = {
  new(options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<string[]>;
};

const barcodeDetectorHost = globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor };
const duplicateWindowMs = 2000;

/* ─── helpers ────────────────────────────────────────────────────── */
function isLikelyNetworkError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message = getErrorMessage(error).toLowerCase();
  return error instanceof TypeError || message.includes("failed to fetch") || message.includes("network");
}

function FeedbackBanner({ feedback }: { feedback: ScanFeedback }) {
  const cfg = {
    success: { border: "border-emerald-200 bg-emerald-50", title: "text-emerald-800", body: "text-emerald-700", icon: CheckCircle2, iconCls: "text-emerald-500" },
    warning: { border: "border-amber-200  bg-amber-50", title: "text-amber-800", body: "text-amber-700", icon: AlertTriangle, iconCls: "text-amber-500" },
    error: { border: "border-red-200    bg-red-50", title: "text-red-800", body: "text-red-700", icon: XCircle, iconCls: "text-red-500" },
    neutral: { border: "border-slate-200  bg-slate-50", title: "text-slate-800", body: "text-slate-600", icon: Shield, iconCls: "text-slate-400" },
  }[feedback.tone];
  const Icon = cfg.icon;
  return (
    <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${cfg.border}`}>
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${cfg.iconCls}`} />
      <div>
        <p className={`text-xs font-bold ${cfg.title}`}>{feedback.title}</p>
        <p className={`text-xs mt-0.5 leading-relaxed ${cfg.body}`}>{feedback.description}</p>
      </div>
    </div>
  );
}

/* ─── component ──────────────────────────────────────────────────── */
export default function TeacherQrAttendance() {
  const { toast } = useToast();
  const { data: user } = useUser();
  const { data: publicSettings } = usePublicSchoolSettings();
  const isMobile = useIsMobile();

  const [token, setToken] = useState("");
  const [direction, setDirection] = useState<"Check In" | "Check Out">("Check In");
  const [status, setStatus] = useState<"Present" | "Late">("Present");
  const [notes, setNotes] = useState("");
  const [scanMode, setScanMode] = useState<ScannerMode>("manual");
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraMsg, setCameraMsg] = useState("Open camera mode to start live QR scanning.");
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);
  const [detectedToken, setDetectedToken] = useState<string | null>(null);
  const [queuedScans, setQueuedScans] = useState<QueuedQrAttendanceScan[]>(() => readOfflineQrAttendanceQueue());
  const [isDraining, setIsDraining] = useState(false);

  const { data: myCard, isLoading: cardLoading } = useMyQrCard();
  const { data: history = [], isLoading: historyLoading } = useQrAttendanceHistory();
  const scanQrAttendance = useScanQrAttendance();
  const isOnline = typeof navigator === "undefined" ? true : navigator.onLine;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const frameRef = useRef<number | null>(null);
  const scanInFlightRef = useRef(false);
  const recentScanRef = useRef<RecentQrScan | null>(null);

  /* ── scan summary ── */
  const scanSummary = useMemo(() => ({
    total: history.length,
    checkIns: history.filter((e: QrHistoryEvent) => e.direction === "Check In").length,
    checkOuts: history.filter((e: QrHistoryEvent) => e.direction === "Check Out").length,
  }), [history]);

  /* ── teacher card data ── */
  const teacherProfile = myCard?.profile.user ?? user;
  const schoolName = publicSettings?.schoolInformation.schoolName ?? "School Nexus Academy";
  const shortName = publicSettings?.schoolInformation.shortName || schoolName;
  const motto = publicSettings?.schoolInformation.motto?.trim() || "Professional excellence through trusted learning leadership.";
  const academicYear = publicSettings?.academicConfiguration.currentAcademicYear ?? "Current Academic Year";
  const currentTerm = publicSettings?.academicConfiguration.currentTerm ?? "Current Term";
  const contactLine = getContactLine(publicSettings);
  const teacherPortraitUrl = useTeacherPortraitUrl(teacherProfile?.teacherPhotoUrl ?? null);

  const teacherCardData: TeacherIdCardData | null = myCard ? {
    schoolName, shortName, motto,
    logoUrl: publicSettings?.branding.logoUrl || undefined,
    teacherName: teacherProfile?.name ?? "Teacher",
    designation: teacherProfile?.designation?.trim() || "Faculty Member",
    department: teacherProfile?.department?.trim() || teacherProfile?.subject?.trim() || "Academic Affairs",
    subject: teacherProfile?.subject?.trim() || "General Studies",
    employeeId: teacherProfile?.employeeId?.trim() || myCard.profile.publicId.toUpperCase(),
    publicId: myCard.profile.publicId,
    qrUrl: buildQrImageUrl(myCard.token, 320),
    portraitUrl: teacherPortraitUrl,
    isActive: myCard.profile.isActive,
    academicYear, currentTerm,
    authenticityLine: contactLine
      ? `Official ${shortName} staff credential • ${contactLine}`
      : `Official ${shortName} staff credential • Valid only when scanned through QR Attendance`,
  } : null;

  /* ── camera / scan logic (unchanged from original) ── */
  useEffect(() => {
    if (isMobile) setScanMode(c => c === "manual" ? "camera" : c);
  }, [isMobile]);

  const refreshQueuedScans = useCallback(() => setQueuedScans(readOfflineQrAttendanceQueue()), []);

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    detectorRef.current = null;
    const stream = streamRef.current;
    if (stream) { stream.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    const video = videoRef.current;
    if (video) { video.pause(); video.srcObject = null; }
  }, []);

  const buildScanPayload = useCallback((rawToken: string, scanMethod: QrScanPayload["scanMethod"]): QrScanPayload => ({
    token: rawToken.trim(), direction,
    status: direction === "Check In" ? status : undefined,
    scanMethod,
    terminalLabel: scanMethod === "camera"
      ? isMobile ? "Teacher mobile camera scanner" : "Teacher camera scanner"
      : "Teacher manual QR entry",
    notes: notes.trim() || undefined,
  }), [direction, isMobile, notes, status]);

  const markRecentScan = useCallback((payload: QrScanPayload) => {
    recentScanRef.current = { token: payload.token.trim(), direction: payload.direction, at: Date.now() };
  }, []);

  const handleScanSuccess = useCallback((payload: QrScanPayload, duplicate: boolean, message?: string) => {
    markRecentScan(payload);
    setDetectedToken(payload.token);
    if (payload.scanMethod === "manual") setToken("");
    setScanFeedback({
      tone: duplicate ? "warning" : "success",
      title: duplicate ? "Duplicate scan avoided" : "QR attendance recorded",
      description: message ?? (duplicate
        ? "An attendance event for this person and direction already exists for today."
        : `${payload.scanMethod === "camera" ? "Camera" : "Manual"} scan saved successfully.`),
    });
  }, [markRecentScan]);

  const submitDirectScan = useCallback(async (rawToken: string, scanMethod: QrScanPayload["scanMethod"]) => {
    const payload = buildScanPayload(rawToken, scanMethod);
    const trimmedToken = payload.token.trim();
    if (!trimmedToken || scanInFlightRef.current) return;
    if (isRecentQrScanDuplicate(recentScanRef.current, trimmedToken, payload.direction, Date.now(), duplicateWindowMs)) {
      setScanFeedback({ tone: "warning", title: "Repeat scan ignored", description: "Same token submitted within the last two seconds." });
      return;
    }
    scanInFlightRef.current = true;
    try {
      const result = await scanQrAttendance.mutateAsync(payload);
      handleScanSuccess(payload, result.data.duplicate, result.message);
      toast({ title: result.data.duplicate ? "Duplicate scan detected" : "QR attendance recorded", description: result.message || `${result.data.event.user?.name ?? "Attendance"} recorded.` });
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        const nextQueue = enqueueOfflineQrAttendanceScan(payload);
        markRecentScan(payload); setQueuedScans(nextQueue); setDetectedToken(payload.token);
        setScanFeedback({ tone: "warning", title: "Saved for offline sync", description: "Queued locally. Will sync when network returns." });
        if (payload.scanMethod === "manual") setToken("");
        toast({ title: "Scan queued offline" });
        return;
      }
      setScanFeedback({ tone: "error", title: "Unable to record QR attendance", description: getErrorMessage(error) });
      toast({ title: "Unable to record QR attendance", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      scanInFlightRef.current = false;
    }
  }, [buildScanPayload, handleScanSuccess, markRecentScan, scanQrAttendance, toast]);

  const drainOfflineQueue = useCallback(async () => {
    if (isDraining || !isOnline) return;
    const queue = readOfflineQrAttendanceQueue();
    if (!queue.length) return;
    setIsDraining(true);
    let replayed = 0;
    try {
      for (const queued of queue) {
        try {
          const result = await submitQrAttendanceScan(queued.payload);
          removeOfflineQrAttendanceScan(queued.id);
          handleScanSuccess(queued.payload, result.data.duplicate, result.message);
          replayed++;
        } catch (error) {
          if (isLikelyNetworkError(error)) { markOfflineQrAttendanceScanError(queued.id, "Still waiting for network."); break; }
          removeOfflineQrAttendanceScan(queued.id);
          toast({ title: "Dropped invalid queued scan", description: getErrorMessage(error), variant: "destructive" });
        }
      }
      refreshQueuedScans();
      if (replayed > 0) {
        await invalidateQrAttendanceQueries();
        toast({ title: `${replayed} queued scan${replayed === 1 ? "" : "s"} synced` });
      }
    } finally {
      setIsDraining(false);
    }
  }, [handleScanSuccess, isDraining, isOnline, refreshQueuedScans, toast]);

  const scanCameraFrame = useCallback(async () => {
    const detector = detectorRef.current, video = videoRef.current;
    if (!detector || !video || scanMode !== "camera") return;
    if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && !scanInFlightRef.current) {
      try {
        const [barcode] = await detector.detect(video);
        const rawValue = barcode?.rawValue?.trim();
        if (rawValue) void submitDirectScan(rawValue, "camera");
      } catch { }
    }
    frameRef.current = requestAnimationFrame(() => void scanCameraFrame());
  }, [scanMode, submitDirectScan]);

  const startCamera = useCallback(async () => {
    if (scanMode !== "camera") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unsupported"); setCameraMsg("Camera API not available. Use manual token entry."); return;
    }
    const Detector = barcodeDetectorHost.BarcodeDetector;
    if (!Detector) {
      setCameraStatus("unsupported"); setCameraMsg("Live QR decoding is not supported in this browser. Use manual entry."); return;
    }
    stopCamera(); setCameraStatus("starting"); setCameraMsg("Requesting camera access…");
    try {
      if (typeof Detector.getSupportedFormats === "function") {
        const fmt = await Detector.getSupportedFormats();
        if (!fmt.includes("qr_code")) {
          setCameraStatus("unsupported"); setCameraMsg("QR decoding not exposed. Use manual mode."); return;
        }
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: isMobile ? { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); }
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(t => t.stop()); throw new Error("Camera preview not available."); }
      streamRef.current = stream; detectorRef.current = new Detector({ formats: ["qr_code"] });
      video.srcObject = stream; video.setAttribute("playsinline", "true"); await video.play();
      setCameraStatus("ready"); setCameraMsg("Camera live · Hold QR card 15–25 cm from lens.");
      frameRef.current = requestAnimationFrame(() => void scanCameraFrame());
    } catch (error) {
      stopCamera();
      const msg = getErrorMessage(error);
      const denied = /denied|permission|notallowed/i.test(msg);
      setCameraStatus(denied ? "denied" : "error");
      setCameraMsg(denied ? "Camera access blocked. Allow permission to use live scanning." : msg || "Unable to start camera.");
    }
  }, [isMobile, scanCameraFrame, scanMode, stopCamera]);

  useEffect(() => {
    if (scanMode !== "camera") { stopCamera(); setCameraStatus("idle"); return; }
    void startCamera();
    return () => stopCamera();
  }, [scanMode, startCamera, stopCamera]);

  useEffect(() => {
    const h = () => void drainOfflineQueue();
    window.addEventListener("online", h);
    return () => window.removeEventListener("online", h);
  }, [drainOfflineQueue]);

  useEffect(() => {
    const h = () => { if (document.hidden) stopCamera(); else if (scanMode === "camera") void startCamera(); };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, [scanMode, startCamera, stopCamera]);

  useEffect(() => {
    if (queuedScans.length > 0 && isOnline) void drainOfflineQueue();
  }, [drainOfflineQueue, isOnline, queuedScans.length]);

  const handleCopyMyToken = async () => {
    if (!myCard?.token) return;
    try {
      await copyToClipboard(myCard.token);
      toast({ title: "Token copied", description: "Your QR fallback token is ready." });
    } catch (error) { toast({ title: "Copy failed", description: getErrorMessage(error), variant: "destructive" }); }
  };

  /* camera status config */
  const camCfg: Record<CameraStatus, { dot: string; label: string }> = {
    idle: { dot: "bg-slate-300", label: "Camera off" },
    starting: { dot: "bg-amber-400 animate-pulse", label: "Starting…" },
    ready: { dot: "bg-emerald-400 animate-pulse", label: "Camera live" },
    unsupported: { dot: "bg-slate-300", label: "Unsupported" },
    denied: { dot: "bg-red-400", label: "Permission denied" },
    error: { dot: "bg-red-400", label: "Error" },
  };

  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <Layout>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-screen-xl px-4 py-6 space-y-5">

          {/* ── Hero ── */}
          <div className="relative overflow-hidden rounded-2xl bg-amber-500 px-5 py-5 text-white shadow-lg shadow-amber-100">
            <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/5" />
            <div className="absolute right-14 top-16 h-20 w-20 rounded-full bg-white/5" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                    <QrCode className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-widest text-amber-100">Teacher Workspace</span>
                </div>
                <h1 className="text-2xl font-bold tracking-tight leading-tight">QR Attendance</h1>
                <p className="text-sm text-amber-100">Scan, record & manage QR-based attendance events</p>
              </div>
              {/* online indicator */}
              <div className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 ${isOnline ? "bg-white/15 border-white/20" : "bg-red-400/20 border-red-300/30"}`}>
                {isOnline
                  ? <Wifi className="h-4 w-4 text-white" />
                  : <WifiOff className="h-4 w-4 text-red-200" />}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200">Network</p>
                  <p className="text-sm font-black text-white leading-tight">{isOnline ? "Online" : "Offline"}</p>
                </div>
              </div>
            </div>
            {/* stat pills */}
            <div className="relative z-10 mt-4 flex flex-wrap gap-2">
              {[
                { label: "QR Events", value: scanSummary.total },
                { label: "Check-ins", value: scanSummary.checkIns },
                { label: "Check-outs", value: scanSummary.checkOuts },
                { label: "Queued", value: queuedScans.length },
              ].map(s => (
                <div key={s.label} className="rounded-xl bg-white/15 border border-white/20 px-3 py-1.5">
                  <p className="text-[9px] font-semibold uppercase tracking-wider text-amber-200">{s.label}</p>
                  <p className="text-base font-black text-white leading-tight">{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Offline queue banner ── */}
          {queuedScans.length > 0 && (
            <div className={`rounded-2xl border px-5 py-4 ${isOnline ? "border-sky-200 bg-sky-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  {isOnline
                    ? <Wifi className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
                    : <WifiOff className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
                  <div>
                    <p className={`text-xs font-bold ${isOnline ? "text-sky-800" : "text-amber-800"}`}>
                      {queuedScans.length} queued scan{queuedScans.length !== 1 ? "s" : ""} {isOnline ? "— syncing…" : "— waiting for network"}
                    </p>
                    <p className={`text-xs mt-0.5 ${isOnline ? "text-sky-600" : "text-amber-600"}`}>
                      {isOnline ? "Replaying queued scans automatically." : "Scans stored locally. Will sync on reconnect."}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {queuedScans.slice(0, 3).map(q => (
                        <div key={q.id} className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/60 px-3 py-1.5">
                          <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="font-mono text-[10px] text-slate-700 truncate">{q.payload.token}</span>
                          <span className="text-[10px] text-slate-500 shrink-0">{q.payload.direction}</span>
                          {q.lastError && <span className="text-[10px] text-amber-600 italic truncate">{q.lastError}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => void drainOfflineQueue()}
                  disabled={isDraining || !isOnline}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-40 shrink-0">
                  {isDraining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* ── Main two-column layout ── */}
          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">

            {/* ── Left: Scanner ── */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-4 border-b border-slate-50">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50">
                    <ScanLine className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">QR Scanner</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Camera or manual token entry</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Feedback */}
                {scanFeedback && <FeedbackBanner feedback={scanFeedback} />}

                {/* Mode toggle */}
                <div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1 gap-1">
                  {(["camera", "manual"] as ScannerMode[]).map(mode => (
                    <button key={mode} onClick={() => setScanMode(mode)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all",
                        scanMode === mode
                          ? "bg-amber-500 text-white shadow-sm"
                          : "text-slate-500 hover:bg-white hover:text-slate-700"
                      )}>
                      {mode === "camera" ? <Camera className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
                      {mode === "camera" ? "Camera Scan" : "Manual Entry"}
                    </button>
                  ))}
                </div>

                {/* Camera view */}
                {scanMode === "camera" && (
                  <div className="space-y-3">
                    <div className="relative overflow-hidden rounded-2xl bg-slate-900 aspect-video">
                      <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
                      {/* corner markers */}
                      {cameraStatus === "ready" && (
                        <>
                          <div className="absolute top-3 left-3 h-8 w-8 border-t-2 border-l-2 border-amber-400 rounded-tl-lg" />
                          <div className="absolute top-3 right-3 h-8 w-8 border-t-2 border-r-2 border-amber-400 rounded-tr-lg" />
                          <div className="absolute bottom-3 left-3 h-8 w-8 border-b-2 border-l-2 border-amber-400 rounded-bl-lg" />
                          <div className="absolute bottom-3 right-3 h-8 w-8 border-b-2 border-r-2 border-amber-400 rounded-br-lg" />
                          {/* scan line */}
                          <div className="absolute inset-x-8 h-0.5 bg-amber-400/70 top-1/2 animate-pulse rounded-full" />
                        </>
                      )}
                      {/* status overlay when not ready */}
                      {cameraStatus !== "ready" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/80">
                          {cameraStatus === "starting"
                            ? <Loader2 className="h-6 w-6 text-amber-400 animate-spin" />
                            : <Camera className="h-6 w-6 text-slate-500" />}
                          <p className="text-xs text-slate-300 text-center px-6">{cameraMsg}</p>
                        </div>
                      )}
                    </div>
                    {/* camera status bar */}
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${camCfg[cameraStatus].dot}`} />
                        <span className="text-xs font-semibold text-slate-700">{camCfg[cameraStatus].label}</span>
                        {isMobile && <span className="text-[10px] text-slate-400">· Rear cam preferred</span>}
                        {scanQrAttendance.isPending && <span className="text-[10px] text-amber-600 font-semibold">Processing…</span>}
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => void startCamera()} disabled={cameraStatus === "starting"}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                          <RefreshCcw className="h-3 w-3" /> Restart
                        </button>
                        <button onClick={stopCamera}
                          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-50 transition-colors">
                          Stop
                        </button>
                      </div>
                    </div>
                    {detectedToken && (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <p className="font-mono text-[10px] text-emerald-700 truncate">Last: {detectedToken}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Manual entry */}
                {scanMode === "manual" && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">QR Token</label>
                      <input
                        value={token}
                        onChange={e => setToken(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && void submitDirectScan(token, "manual")}
                        placeholder="SNXQR...."
                        className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400"
                      />
                    </div>
                    <button
                      onClick={() => void submitDirectScan(token, "manual")}
                      disabled={scanQrAttendance.isPending || !token.trim()}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white shadow-sm shadow-amber-200 hover:bg-amber-600 transition-colors disabled:opacity-40">
                      {scanQrAttendance.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                      Record Attendance
                    </button>
                  </div>
                )}

                {/* Scan options */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">Direction</label>
                    <Select value={direction} onValueChange={(v: "Check In" | "Check Out") => setDirection(v)}>
                      <SelectTrigger className="h-9 rounded-xl border-slate-200 bg-slate-50 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Check In" className="text-xs">Check In</SelectItem>
                        <SelectItem value="Check Out" className="text-xs">Check Out</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600">Status</label>
                    <Select value={status} onValueChange={(v: "Present" | "Late") => setStatus(v)} disabled={direction === "Check Out"}>
                      <SelectTrigger className="h-9 rounded-xl border-slate-200 bg-slate-50 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Present" className="text-xs">Present</SelectItem>
                        <SelectItem value="Late" className="text-xs">Late</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Notes (optional)</label>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Optional note for this scan event…"
                    className="rounded-xl border-slate-200 bg-slate-50 text-xs resize-none h-16 focus:ring-amber-400/40 focus:border-amber-400"
                  />
                </div>

                {/* Safeguards info */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Scanner Safeguards</p>
                  {[
                    "Same token+direction suppressed for 2 seconds in browser",
                    "Offline scans queued locally and replayed on reconnect",
                    "Camera stream stops on tab hide and page unmount",
                  ].map(s => (
                    <div key={s} className="flex items-start gap-2">
                      <Shield className="h-3 w-3 text-slate-300 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-slate-500">{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Right: Teacher QR Card ── */}
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="px-5 pt-5 pb-4 border-b border-slate-50">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50">
                    <QrCode className="h-4 w-4 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">My Teacher QR Card</h2>
                    <p className="text-xs text-slate-400 mt-0.5">Personal staff credential</p>
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {cardLoading || !myCard ? (
                  <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                  </div>
                ) : (
                  <>
                    <TeacherIdCardPreview card={teacherCardData!} />

                    {/* status pills */}
                    <div className="flex items-center justify-center flex-wrap gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${myCard.profile.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                        {myCard.profile.isActive ? "Active" : "Inactive"}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-mono font-bold text-slate-600">
                        {myCard.profile.publicId}
                      </span>
                    </div>

                    {/* token display */}
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="flex-1 break-all font-mono text-[10px] text-slate-600">{myCard.token}</p>
                      <button onClick={handleCopyMyToken}
                        className="shrink-0 flex items-center justify-center h-7 w-7 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors shadow-sm">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* actions */}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Link href="/teacher/qr-card" className="flex-1">
                        <button className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-white shadow-sm shadow-amber-200 hover:bg-amber-600 transition-colors">
                          <ExternalLink className="h-3.5 w-3.5" /> Full Card Workspace
                        </button>
                      </Link>
                      <button onClick={handleCopyMyToken}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
                        <Copy className="h-3.5 w-3.5" /> Copy Token
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── QR History ── */}
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-50">
              <div>
                <h2 className="text-sm font-bold text-slate-900">QR Attendance History</h2>
                <p className="text-xs text-slate-400 mt-0.5">Your events, scans you performed, and authorized student records</p>
              </div>
              {history.length > 0 && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
                  {Math.min(history.length, 12)} records
                </span>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    {["Person", "Direction", "Status", "Scanned At", "Method"].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {historyLoading ? (
                    <tr><td colSpan={5} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-amber-400" /></td></tr>
                  ) : history.length === 0 ? (
                    <tr><td colSpan={5} className="py-10 text-center text-sm text-slate-400">No QR attendance records yet.</td></tr>
                  ) : (
                    history.slice(0, 12).map((event: QrHistoryEvent) => {
                      const isIn = event.direction === "Check In";
                      return (
                        <tr key={event.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2.5 text-xs font-bold text-slate-900">{event.user?.name ?? `User #${event.userId}`}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold
                              ${isIn ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-sky-50 text-sky-700 border-sky-200"}`}>
                              {event.direction}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{event.status ?? "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{formatDate(event.scannedAt, "MMM dd, yyyy h:mm a")}</td>
                          <td className="px-4 py-2.5 text-xs capitalize text-slate-500">{event.scanMethod}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden p-4 space-y-2">
              {historyLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-amber-400" /></div>
              ) : history.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No QR records yet.</p>
              ) : (
                history.slice(0, 12).map((event: QrHistoryEvent) => {
                  const isIn = event.direction === "Check In";
                  return (
                    <div key={event.id}
                      className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border
                        ${isIn ? "bg-emerald-50 border-emerald-200" : "bg-sky-50 border-sky-200"}`}>
                        <ScanLine className={`h-4 w-4 ${isIn ? "text-emerald-500" : "text-sky-500"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-slate-900 truncate">{event.user?.name ?? `User #${event.userId}`}</p>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold
                            ${isIn ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-sky-50 text-sky-700 border-sky-200"}`}>
                            {event.direction}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {formatDate(event.scannedAt, "MMM dd, h:mm a")} · {event.scanMethod} · {event.status ?? "—"}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      </div>
    </Layout>
  );
}
