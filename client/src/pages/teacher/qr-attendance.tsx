import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
import { Camera, Copy, Loader2, QrCode, RefreshCcw, ScanLine, Smartphone, Wifi, WifiOff } from "lucide-react";
import { z } from "zod";

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

function isLikelyNetworkError(error: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const message = getErrorMessage(error).toLowerCase();
  return error instanceof TypeError || message.includes("failed to fetch") || message.includes("network");
}

function getFeedbackStyles(tone: FeedbackTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (tone === "error") return "border-destructive/40 bg-destructive/5 text-destructive";
  return "border-border bg-muted/40 text-foreground";
}

export default function TeacherQrAttendance() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [token, setToken] = useState("");
  const [direction, setDirection] = useState<"Check In" | "Check Out">("Check In");
  const [status, setStatus] = useState<"Present" | "Late">("Present");
  const [notes, setNotes] = useState("");
  const [scanMode, setScanMode] = useState<ScannerMode>("manual");
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraMessage, setCameraMessage] = useState("Open camera mode to start live QR scanning.");
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);
  const [detectedToken, setDetectedToken] = useState<string | null>(null);
  const [queuedScans, setQueuedScans] = useState<QueuedQrAttendanceScan[]>(() => readOfflineQrAttendanceQueue());
  const [isDrainingQueue, setIsDrainingQueue] = useState(false);

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

  const scanSummary = useMemo(() => ({
    total: history.length,
    checkIns: history.filter((event: QrHistoryEvent) => event.direction === "Check In").length,
    checkOuts: history.filter((event: QrHistoryEvent) => event.direction === "Check Out").length,
  }), [history]);

  useEffect(() => {
    if (isMobile) setScanMode((current) => (current === "manual" ? "camera" : current));
  }, [isMobile]);

  const refreshQueuedScans = useCallback(() => {
    setQueuedScans(readOfflineQrAttendanceQueue());
  }, []);

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    detectorRef.current = null;

    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }, []);

  const buildScanPayload = useCallback((rawToken: string, scanMethod: QrScanPayload["scanMethod"]): QrScanPayload => ({
    token: rawToken.trim(),
    direction,
    status: direction === "Check In" ? status : undefined,
    scanMethod,
    terminalLabel: scanMethod === "camera"
      ? isMobile ? "Teacher mobile camera scanner" : "Teacher camera scanner"
      : "Teacher manual QR entry",
    notes: notes.trim() || undefined,
  }), [direction, isMobile, notes, status]);

  const markRecentScan = useCallback((payload: QrScanPayload) => {
    recentScanRef.current = {
      token: payload.token.trim(),
      direction: payload.direction,
      at: Date.now(),
    };
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

    if (!trimmedToken) return;
    if (scanInFlightRef.current) return;

    if (isRecentQrScanDuplicate(recentScanRef.current, trimmedToken, payload.direction, Date.now(), duplicateWindowMs)) {
      setScanFeedback({
        tone: "warning",
        title: "Repeat scan ignored",
        description: "The same token was already submitted in the last two seconds, so no second request was sent.",
      });
      return;
    }

    scanInFlightRef.current = true;

    try {
      const result = await scanQrAttendance.mutateAsync(payload);
      handleScanSuccess(payload, result.data.duplicate, result.message);
      toast({
        title: result.data.duplicate ? "Duplicate scan detected" : "QR attendance recorded",
        description: result.message || `${result.data.event.user?.name ?? "Attendance"} has been recorded successfully.`,
      });
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        const nextQueue = enqueueOfflineQrAttendanceScan(payload);
        markRecentScan(payload);
        setQueuedScans(nextQueue);
        setDetectedToken(payload.token);
        setScanFeedback({
          tone: "warning",
          title: "Saved for offline sync",
          description: "The scan was queued locally and will sync automatically when the network returns.",
        });
        if (payload.scanMethod === "manual") setToken("");
        toast({ title: "Scan queued offline", description: "The request will be replayed automatically when connectivity is restored." });
        return;
      }

      setScanFeedback({ tone: "error", title: "Unable to record QR attendance", description: getErrorMessage(error) });
      toast({ title: "Unable to record QR attendance", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      scanInFlightRef.current = false;
    }
  }, [buildScanPayload, handleScanSuccess, markRecentScan, scanQrAttendance, toast]);

  const drainOfflineQueue = useCallback(async () => {
    if (isDrainingQueue) return;
    if (!isOnline) return;

    const queue = readOfflineQrAttendanceQueue();
    if (queue.length === 0) return;

    setIsDrainingQueue(true);
    let replayedCount = 0;

    try {
      for (const queued of queue) {
        try {
          const result = await submitQrAttendanceScan(queued.payload);
          removeOfflineQrAttendanceScan(queued.id);
          handleScanSuccess(queued.payload, result.data.duplicate, result.message);
          replayedCount += 1;
        } catch (error) {
          if (isLikelyNetworkError(error)) {
            markOfflineQrAttendanceScanError(queued.id, "Still waiting for network connectivity.");
            break;
          }

          removeOfflineQrAttendanceScan(queued.id);
          toast({ title: "Dropped invalid queued scan", description: getErrorMessage(error), variant: "destructive" });
        }
      }

      refreshQueuedScans();

      if (replayedCount > 0) {
        await invalidateQrAttendanceQueries();
        toast({
          title: replayedCount === 1 ? "Queued scan synced" : `${replayedCount} queued scans synced`,
          description: "Offline QR attendance events were replayed successfully.",
        });
      }
    } finally {
      setIsDrainingQueue(false);
    }
  }, [handleScanSuccess, isDrainingQueue, isOnline, refreshQueuedScans, toast]);

  const scanCameraFrame = useCallback(async () => {
    const detector = detectorRef.current;
    const video = videoRef.current;

    if (!detector || !video || scanMode !== "camera") return;

    if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA && !scanInFlightRef.current) {
      try {
        const [barcode] = await detector.detect(video);
        const rawValue = barcode?.rawValue?.trim();
        if (rawValue) {
          void submitDirectScan(rawValue, "camera");
        }
      } catch {
        // Browser-native detector errors are non-fatal; continue the loop.
      }
    }

    frameRef.current = requestAnimationFrame(() => {
      void scanCameraFrame();
    });
  }, [scanMode, submitDirectScan]);

  const startCamera = useCallback(async () => {
    if (scanMode !== "camera") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("unsupported");
      setCameraMessage("This browser does not expose camera access. Switch to manual token entry on this device.");
      return;
    }

    const Detector = barcodeDetectorHost.BarcodeDetector;
    if (!Detector) {
      setCameraStatus("unsupported");
      setCameraMessage("Live QR decoding is not supported by this browser yet. Manual token entry remains available.");
      return;
    }

    stopCamera();
    setCameraStatus("starting");
    setCameraMessage("Requesting camera access and preferring the rear camera where available.");

    try {
      if (typeof Detector.getSupportedFormats === "function") {
        const supportedFormats = await Detector.getSupportedFormats();
        if (!supportedFormats.includes("qr_code")) {
          setCameraStatus("unsupported");
          setCameraMessage("This browser camera API is available, but QR decoding is not exposed. Use manual mode on this device.");
          return;
        }
      }

      let stream: MediaStream;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: isMobile
            ? { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Camera preview element is not available.");
      }

      streamRef.current = stream;
      detectorRef.current = new Detector({ formats: ["qr_code"] });
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();

      setCameraStatus("ready");
      setCameraMessage("Camera is live. Hold the QR card 15–25cm from the lens for automatic capture.");
      frameRef.current = requestAnimationFrame(() => {
        void scanCameraFrame();
      });
    } catch (error) {
      stopCamera();
      const message = getErrorMessage(error);
      const denied = /denied|permission|notallowed/i.test(message);
      setCameraStatus(denied ? "denied" : "error");
      setCameraMessage(denied
        ? "Camera access was blocked. Allow camera permission to use live scanning on this device."
        : message || "Unable to start the camera scanner.");
    }
  }, [isMobile, scanCameraFrame, scanMode, stopCamera]);

  useEffect(() => {
    if (scanMode !== "camera") {
      stopCamera();
      setCameraStatus("idle");
      setCameraMessage("Switch to camera mode whenever you want to scan a QR card live.");
      return;
    }

    void startCamera();
    return () => stopCamera();
  }, [scanMode, startCamera, stopCamera]);

  useEffect(() => {
    const handleOnline = () => {
      void drainOfflineQueue();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [drainOfflineQueue]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopCamera();
      } else if (scanMode === "camera") {
        void startCamera();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [scanMode, startCamera, stopCamera]);

  useEffect(() => {
    if (queuedScans.length > 0 && isOnline) {
      void drainOfflineQueue();
    }
  }, [drainOfflineQueue, isOnline, queuedScans.length]);

  const handleScan = async () => {
    await submitDirectScan(token, "manual");
  };

  const handleCopyMyToken = async () => {
    if (!myCard?.token) return;
    try {
      await copyToClipboard(myCard.token);
      toast({ title: "QR token copied", description: "Your teacher QR fallback token is ready to share with an authorized administrator if needed." });
    } catch (error) {
      toast({ title: "Unable to copy token", description: getErrorMessage(error), variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">QR Attendance</h1>
          <p className="mt-1 text-muted-foreground">Record student or teacher attendance with a live camera scanner when supported, keep an offline retry queue, and access your own teacher QR card from the same workspace.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "QR events visible", value: scanSummary.total },
            { label: "Check-ins", value: scanSummary.checkIns },
            { label: "Check-outs", value: scanSummary.checkOuts },
          ].map((item) => (
            <Card key={item.label}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{item.label}</p><p className="mt-2 text-3xl font-display font-bold">{item.value}</p></CardContent></Card>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5" /> Scan or paste attendance token</CardTitle>
              <CardDescription>Camera scanning uses browser-native APIs with rear-camera preference on mobile when supported. Manual token entry remains available as the fallback path.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {scanFeedback ? (
                <div className={cn("rounded-xl border px-4 py-3", getFeedbackStyles(scanFeedback.tone))}>
                  <p className="text-sm font-semibold">{scanFeedback.title}</p>
                  <p className="mt-1 text-xs leading-5">{scanFeedback.description}</p>
                </div>
              ) : null}

              {queuedScans.length > 0 ? (
                <Alert>
                  {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                  <AlertTitle>{queuedScans.length} queued scan{queuedScans.length === 1 ? "" : "s"} waiting to sync</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>
                      {isOnline
                        ? "Connectivity is back. Queued scans are being replayed automatically."
                        : "You are offline. New scans will be stored locally and sent once the network returns."}
                    </p>
                    <div className="space-y-2 text-xs text-muted-foreground">
                      {queuedScans.slice(0, 3).map((queued) => (
                        <div key={queued.id} className="rounded-lg border bg-background px-3 py-2">
                          <p className="font-mono text-[11px] text-foreground">{queued.payload.token}</p>
                          <p>{queued.payload.direction} • {formatDate(queued.createdAt, "MMM dd, yyyy h:mm a")}</p>
                          {queued.lastError ? <p className="text-amber-700">{queued.lastError}</p> : null}
                        </div>
                      ))}
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => void drainOfflineQueue()} disabled={isDrainingQueue || !isOnline}>
                      {isDrainingQueue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />} Retry queued scans
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              <Tabs value={scanMode} onValueChange={(value) => setScanMode(value as ScannerMode)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="camera"><Camera className="mr-2 h-4 w-4" /> Camera scan</TabsTrigger>
                  <TabsTrigger value="manual"><Smartphone className="mr-2 h-4 w-4" /> Manual entry</TabsTrigger>
                </TabsList>
                <TabsContent value="camera" className="space-y-4">
                  <div className="overflow-hidden rounded-2xl border bg-slate-950">
                    <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={cameraStatus === "ready" ? "secondary" : "outline"}>{cameraStatus === "ready" ? "Camera live" : cameraStatus}</Badge>
                    {isMobile ? <Badge variant="outline">Rear camera preferred</Badge> : <Badge variant="outline">Desktop camera mode</Badge>}
                    {scanQrAttendance.isPending ? <Badge variant="outline">Processing scan…</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{cameraMessage}</p>
                  {detectedToken ? <p className="rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs">Last detected token: {detectedToken}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => void startCamera()} disabled={cameraStatus === "starting"}>
                      {cameraStatus === "starting" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />} Restart camera
                    </Button>
                    <Button type="button" variant="ghost" onClick={stopCamera}>Stop camera</Button>
                  </div>
                </TabsContent>
                <TabsContent value="manual" className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">QR token</p>
                    <Input value={token} onChange={(event) => setToken(event.target.value)} placeholder="SNXQR...." />
                  </div>
                  <Button className="w-full" onClick={handleScan} disabled={scanQrAttendance.isPending || !token.trim()}>
                    {scanQrAttendance.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />} Record QR attendance
                  </Button>
                </TabsContent>
              </Tabs>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Direction</p>
                  <Select value={direction} onValueChange={(value: "Check In" | "Check Out") => setDirection(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Check In">Check In</SelectItem>
                      <SelectItem value="Check Out">Check Out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Mark status</p>
                  <Select value={status} onValueChange={(value: "Present" | "Late") => setStatus(value)} disabled={direction === "Check Out"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Present">Present</SelectItem>
                      <SelectItem value="Late">Late</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Notes</p>
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional note for the scan event" className="min-h-[96px]" />
              </div>
              <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Scanner safeguards</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Identical token+direction submissions are suppressed for 2 seconds in the browser.</li>
                  <li>Offline scans are queued locally and replayed on reconnect.</li>
                  <li>Camera streams are stopped on tab hide, mode change, and page unmount.</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> My teacher QR card</CardTitle>
              <CardDescription>Your personal QR credential can also be checked by an authorized scanner for teacher attendance workflows.</CardDescription>
            </CardHeader>
            <CardContent>
              {cardLoading || !myCard ? (
                <div className="flex min-h-[320px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-violet-600" /></div>
              ) : (
                <div className="space-y-4 text-center">
                  <img src={buildQrImageUrl(myCard.token)} alt="Teacher QR card" className="mx-auto aspect-square w-full max-w-[260px] rounded-2xl border bg-white p-3" />
                  <div className="flex items-center justify-center gap-2">
                    <Badge variant={myCard.profile.isActive ? "secondary" : "destructive"}>{myCard.profile.isActive ? "Active" : "Inactive"}</Badge>
                    <Badge variant="outline">{myCard.profile.publicId}</Badge>
                  </div>
                  <p className="break-all rounded-2xl border bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700">{myCard.token}</p>
                  <Button variant="outline" onClick={handleCopyMyToken}><Copy className="mr-2 h-4 w-4" /> Copy my token</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent QR attendance history</CardTitle>
            <CardDescription>Role-aware history shows your own QR events, scans you performed, and authorized visibility into student records.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Person</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scanned at</TableHead>
                  <TableHead>Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLoading ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-violet-600" /></TableCell></TableRow>
                ) : history.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No QR attendance records available yet.</TableCell></TableRow>
                ) : (
                  history.slice(0, 12).map((event: QrHistoryEvent) => (
                    <TableRow key={event.id}>
                      <TableCell className="pl-6 font-medium">{event.user?.name ?? `User #${event.userId}`}</TableCell>
                      <TableCell>{event.direction}</TableCell>
                      <TableCell>{event.status ?? "—"}</TableCell>
                      <TableCell>{formatDate(event.scannedAt, "MMM dd, yyyy h:mm a")}</TableCell>
                      <TableCell className="capitalize">{event.scanMethod}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout >
  );
}
