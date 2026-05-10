/**
 * @file activityLogger.ts
 * @description Activity Logger middleware — captures HTTP request metadata
 * for the audit trail, including timing, user info, and response status.
 */

import type { Request, Response, NextFunction } from "express";
import { logActivity } from "../services/activityLogService.js";
import type { ActivityLogAction } from "../../shared/schema.js";

// Paths that should be logged even on GET (e.g., exports)
const LOGGED_GET_PATHS = ["/api/reports/", "/api/finance/export", "/api/export"];

// Paths to skip entirely (health checks, static files, etc.)
const SKIP_PATHS = [
  "/api/auth/login",
  "/api/health",
  "/api/debug",
  "/socket.io",
];

function shouldLogRequest(method: string, path: string): boolean {
  // Skip specific paths
  if (SKIP_PATHS.some((skip) => path.startsWith(skip))) {
    return false;
  }

  // Log mutations
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return true;
  }

  // Log specific GET requests (exports, etc.)
  if (method === "GET") {
    return LOGGED_GET_PATHS.some((logged) => path.startsWith(logged));
  }

  return false;
}

function extractActionFromMethod(method: string, path: string): ActivityLogAction {
  const methodToAction: Record<string, ActivityLogAction> = {
    POST: "CREATE",
    PUT: "UPDATE",
    PATCH: "UPDATE",
    DELETE: "DELETE",
  };

  if (method === "GET") {
    if (path.includes("/export") || path.includes("/download")) {
      return "EXPORT";
    }
    return "VIEW";
  }

  return methodToAction[method] ?? "VIEW";
}

function getClientIp(req: Request): string {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

export function activityLogger(req: Request, res: Response, next: NextFunction) {
  // Only log "important" requests
  if (!shouldLogRequest(req.method, req.path)) {
    return next();
  }

  const startTime = Date.now();
  const userId = (req.session as any)?.userId;
  const userEmail = (req.session as any)?.userEmail || "anonymous";
  const userRole = (req.session as any)?.userRole || "unknown";

  // Capture response when it finishes
  res.on("finish", async () => {
    const durationMs = Date.now() - startTime;
    const action = extractActionFromMethod(req.method, req.path);

    // Extract entity type and ID from path (e.g., /api/students/123 -> entityType: student, entityId: 123)
    const pathParts = req.path.split("/").filter(Boolean);
    const entityType = pathParts[1]?.replace(/s$/, "") || "unknown"; // Remove trailing 's'
    const entityId = pathParts[2] ? parseInt(pathParts[2], 10) : undefined;

    // Determine if we should log based on status code (skip 401, 403 client errors for auth)
    const shouldLogStatus =
      res.statusCode >= 200 && res.statusCode < 400;

    if (!shouldLogStatus) {
      return;
    }

    await logActivity({
      userId: userId ?? undefined,
      userEmail,
      userRole,
      action,
      entityType,
      entityId,
      oldValues: undefined,
      newValues: undefined,
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] || null,
      requestMethod: req.method,
      requestPath: req.path,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
}

// Manual logger for explicit activity logging (e.g., for specific business actions)
export async function logExplicitActivity(
  req: Request,
  data: {
    action: ActivityLogAction;
    entityType: string;
    entityId?: number;
    oldValues?: Record<string, any>;
    newValues?: Record<string, any>;
  }
): Promise<void> {
  const userId = (req.session as any)?.userId;
  const userEmail = (req.session as any)?.userEmail || "system";
  const userRole = (req.session as any)?.userRole || "system";

  await logActivity({
    userId: userId ?? undefined,
    userEmail,
    userRole,
    action: data.action,
    entityType: data.entityType,
    entityId: data.entityId,
    oldValues: data.oldValues,
    newValues: data.newValues,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] || null,
    requestMethod: req.method,
    requestPath: req.path,
    statusCode: undefined,
    durationMs: undefined,
  });
}