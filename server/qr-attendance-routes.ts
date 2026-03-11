import type { Express, Request, Response } from "express";
import { z } from "zod";
import { api } from "../shared/routes.js";
import type { User } from "../shared/schema.js";
import { isValidQrTokenFormat } from "./qr-service.js";

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

function isBlockedPortraitProxyHostname(hostname: string) {
  const value = hostname.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (!value) return true;
  if (value === "localhost" || value === "::1") return true;
  if (/^127\./.test(value)) return true;
  if (/^10\./.test(value)) return true;
  if (/^192\.168\./.test(value)) return true;
  if (/^169\.254\./.test(value)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(value)) return true;
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(value)) return true;
  if (/^fe80:/i.test(value)) return true;
  return false;
}

type StorageLike = Pick<
  typeof import("./storage.js").storage,
  "getStudents" | "getTeachers" | "getQrProfiles" | "getQrAttendanceEvents" | "getUser" | "issueQrProfile" | "regenerateQrProfile" | "setQrProfileActive" | "getMyQrCard" | "scanQrAttendance"
>;

export function registerQrAttendanceRoutes(
  app: Express,
  {
    storage,
    requireRole,
    sendApiSuccess,
    sendApiError,
    parseNumberValue,
    getTeacherClassNames,
  }: {
    storage: StorageLike;
    requireRole: (req: Request, res: Response, allowedRoles: User["role"][]) => Promise<User | undefined>;
    sendApiSuccess: <T>(res: Response, data: T, message?: string, statusCode?: number) => Response;
    sendApiError: (res: Response, statusCode: number, error: string) => Response;
    parseNumberValue: (value: unknown) => number;
    getTeacherClassNames: (teacherId: number) => Promise<Set<string>>;
  },
) {
  app.get(api.qrAttendance.profiles.list.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const today = new Date().toISOString().slice(0, 10);
      const [studentsList, teachersList, profiles, todayEvents] = await Promise.all([
        storage.getStudents(),
        storage.getTeachers(),
        storage.getQrProfiles(),
        storage.getQrAttendanceEvents({ attendanceDate: today }),
      ]);

      const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));
      const directionsMap = new Map<number, Set<string>>();

      for (const event of todayEvents) {
        const directions = directionsMap.get(event.userId) ?? new Set<string>();
        directions.add(event.direction);
        directionsMap.set(event.userId, directions);
      }

      const eligibleUsers = [...studentsList, ...teachersList].sort((left, right) => left.name.localeCompare(right.name));
      const roster = eligibleUsers.map((member) => ({
        user: member,
        profile: profileMap.get(member.id) ?? null,
        todayDirections: Array.from(directionsMap.get(member.id) ?? []),
      }));

      return sendApiSuccess(res, {
        roster,
        summary: {
          eligibleUsers: eligibleUsers.length,
          issuedProfiles: profiles.length,
          activeProfiles: profiles.filter((profile) => profile.isActive).length,
          scansToday: todayEvents.length,
          studentProfiles: profiles.filter((profile) => profile.user?.role === "student").length,
          teacherProfiles: profiles.filter((profile) => profile.user?.role === "teacher").length,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) return sendApiError(res, 400, err.errors[0]?.message ?? "Invalid request");
      return sendApiError(res, 500, "Failed to load QR attendance roster");
    }
  });

  app.post(api.qrAttendance.profiles.issue.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const userId = parseNumberValue(req.params.userId);
      if (Number.isNaN(userId)) return sendApiError(res, 400, "Invalid user id");

      const target = await storage.getUser(userId);
      if (!target || !["student", "teacher"].includes(target.role)) {
        return sendApiError(res, 404, "QR cards can only be issued to students and teachers");
      }

      const issued = await storage.issueQrProfile(userId, user.id);
      return sendApiSuccess(
        res,
        { profile: issued.profile, token: issued.token },
        issued.created ? "QR card issued successfully" : "QR card already exists",
      );
    } catch (err) {
      if (err instanceof z.ZodError) return sendApiError(res, 400, err.errors[0]?.message ?? "Invalid request");
      return sendApiError(res, 500, "Failed to issue QR card");
    }
  });

  app.post(api.qrAttendance.profiles.regenerate.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const userId = parseNumberValue(req.params.userId);
      if (Number.isNaN(userId)) return sendApiError(res, 400, "Invalid user id");

      const target = await storage.getUser(userId);
      if (!target || !["student", "teacher"].includes(target.role)) {
        return sendApiError(res, 404, "QR cards can only be issued to students and teachers");
      }

      const regenerated = await storage.regenerateQrProfile(userId, user.id);
      return sendApiSuccess(res, { profile: regenerated.profile, token: regenerated.token }, "QR card regenerated successfully");
    } catch (err) {
      if (err instanceof z.ZodError) return sendApiError(res, 400, err.errors[0]?.message ?? "Invalid request");
      return sendApiError(res, 500, "Failed to regenerate QR card");
    }
  });

  app.patch(api.qrAttendance.profiles.updateStatus.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin"]);
      if (!user) return;

      const userId = parseNumberValue(req.params.userId);
      if (Number.isNaN(userId)) return sendApiError(res, 400, "Invalid user id");

      const input = api.qrAttendance.profiles.updateStatus.input.parse(req.body);
      const profile = await storage.setQrProfileActive(userId, input.isActive);

      if (!profile) return sendApiError(res, 404, "QR card not found");

      return sendApiSuccess(res, { profile }, input.isActive ? "QR card activated" : "QR card deactivated");
    } catch (err) {
      if (err instanceof z.ZodError) return sendApiError(res, 400, err.errors[0]?.message ?? "Invalid request");
      return sendApiError(res, 500, "Failed to update QR card status");
    }
  });

  app.get(api.qrAttendance.myCard.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["student", "teacher"]);
      if (!user) return;

      const card = await storage.getMyQrCard(user.id);
      if (!card) return sendApiError(res, 404, "QR card not available for this account");

      return sendApiSuccess(res, card);
    } catch (err) {
      if (err instanceof z.ZodError) return sendApiError(res, 400, err.errors[0]?.message ?? "Invalid request");
      return sendApiError(res, 500, "Failed to load QR card");
    }
  });

  app.get(api.qrAttendance.portraitProxy.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin", "teacher", "student"]);
      if (!user) return;

      const input = api.qrAttendance.portraitProxy.input.parse(req.query);
      const portraitUrl = new URL(input.url);

      if (!["http:", "https:"].includes(portraitUrl.protocol)) {
        return res.status(400).json({ message: "Portrait proxy only supports http and https URLs" });
      }

      if (isBlockedPortraitProxyHostname(portraitUrl.hostname)) {
        return res.status(400).json({ message: "Portrait proxy blocked this hostname" });
      }

      const response = await fetch(portraitUrl, {
        headers: {
          Accept: "image/avif,image/webp,image/svg+xml,image/*;q=0.9,*/*;q=0.5",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return res.status(502).json({ message: "Unable to load portrait image" });
      }

      const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
      const imageType = contentType?.startsWith("image/") ? contentType : inferImageMimeType(portraitUrl.toString());

      if (!imageType) {
        return res.status(415).json({ message: "Portrait URL did not return a supported image" });
      }

      const body = Buffer.from(await response.arrayBuffer());
      res.setHeader("Content-Type", imageType);
      res.setHeader("Content-Length", String(body.byteLength));
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("Vary", "Cookie");
      return res.status(200).end(body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0]?.message ?? "Invalid request" });
      }

      return res.status(502).json({ message: "Unable to proxy portrait image" });
    }
  });

  app.get(api.qrAttendance.history.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin", "teacher", "student"]);
      if (!user) return;

      const input = api.qrAttendance.history.input.parse(req.query);
      const requestedUserId = user.role === "student" ? user.id : input.userId;
      let events = await storage.getQrAttendanceEvents({
        userId: requestedUserId,
        role: input.role,
        attendanceDate: input.attendanceDate,
      });

      if (user.role === "teacher") {
        const classNames = await getTeacherClassNames(user.id);
        events = events.filter(
          (event) =>
            event.userId === user.id ||
            event.scannedBy === user.id ||
            (event.user?.role === "student" && Boolean(event.user.className) && classNames.has(event.user.className ?? "")),
        );
      }

      return sendApiSuccess(res, { events });
    } catch (err) {
      if (err instanceof z.ZodError) return sendApiError(res, 400, err.errors[0]?.message ?? "Invalid request");
      return sendApiError(res, 500, "Failed to load QR attendance history");
    }
  });

  app.post(api.qrAttendance.scan.path, async (req, res) => {
    try {
      const user = await requireRole(req, res, ["admin", "teacher"]);
      if (!user) return;

      const input = api.qrAttendance.scan.input.parse(req.body);
      if (!isValidQrTokenFormat(input.token)) {
        return sendApiError(res, 400, "Invalid QR token format");
      }

      const result = await storage.scanQrAttendance({
        token: input.token,
        scannedBy: user.id,
        direction: input.direction,
        status: input.status,
        scanMethod: input.scanMethod,
        terminalLabel: input.terminalLabel,
        notes: input.notes,
      });

      if (!result) {
        return sendApiError(res, 404, "QR card not found or inactive");
      }

      return sendApiSuccess(
        res,
        result,
        result.duplicate ? "Duplicate scan detected for this direction today" : "QR attendance recorded successfully",
      );
    } catch (err) {
      if (err instanceof z.ZodError) return sendApiError(res, 400, err.errors[0]?.message ?? "Invalid request");
      return sendApiError(res, 500, "Failed to process QR attendance scan");
    }
  });
}