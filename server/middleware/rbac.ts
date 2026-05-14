/**
 * @file rbac.ts
 * @description Role-Based Access Control (RBAC) middleware factory.
 *
 * Provides `hasPermission(permission)` — an Express middleware that checks
 * whether the authenticated session user holds a given permission string.
 *
 * Permission model
 * ────────────────
 * Because the current codebase uses session-based auth (not JWT), permissions
 * are derived from the user's `role` field via a static role→permissions map.
 * This keeps the implementation self-contained and avoids a DB round-trip on
 * every request while remaining easy to extend.
 *
 * @module server/middleware/rbac
 */

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage.ts";

// ── Permission registry ────────────────────────────────────────────────────

/**
 * Maps each role to the set of permissions it holds.
 *
 * Extend this map whenever a new permission is introduced.
 */
const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  super_admin: new Set([
    "platform:read",
    "platform:write",
    "platform:manage",
    "owners:read",
    "owners:write",
    "billing:read",
    "billing:write",
    "audit:read",
    "system:health",
    "settings:read",
    "settings:write",
    "impersonate",
  ]),
  admin: new Set([
    "student:history",
    "student:read",
    "student:write",
    "fees:read",
    "fees:write",
    "vouchers:read",
    "vouchers:write",
    "reports:read",
    // Payroll & salary history permissions
    "salary:history:read",
    "salary:history:write",
    "payroll:read",
    "payroll:write",
    "payroll:reconcile",
  ]),
  teacher: new Set([
    "student:history",
    "student:read",
    "fees:read",
    // Teachers may view their own salary history only (enforced at route level)
    "salary:history:self",
  ]),
  student: new Set([
    // Students may only view their own history — enforced at the route level.
    "student:history:self",
  ]),
};

// ── Middleware factory ─────────────────────────────────────────────────────

/**
 * Returns an Express middleware that enforces the given permission.
 *
 * The middleware:
 * 1. Resolves the session user via `storage.getUser`.
 * 2. Looks up the user's role in {@link ROLE_PERMISSIONS}.
 * 3. Returns **403** if the permission is absent.
 * 4. Calls `next()` on success.
 *
 * @param permission - The permission string to check (e.g. `"student:history"`).
 *
 * @example
 * ```ts
 * app.get(
 *   "/api/student/history/:studentId",
 *   hasPermission("student:history"),
 *   async (req, res) => { … }
 * );
 * ```
 */
export function hasPermission(permission: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // 1. Resolve session user
    const userId: number | undefined = req.session?.userId;
    if (!userId) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    let user: Awaited<ReturnType<typeof storage.getUser>>;
    try {
      user = await storage.getUser(userId);
    } catch {
      res.status(500).json({ success: false, error: "Internal server error" });
      return;
    }

    if (!user) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }

    // 2. Check permission
    const rolePerms = ROLE_PERMISSIONS[user.role] ?? new Set<string>();
    if (!rolePerms.has(permission)) {
      res.status(403).json({ success: false, error: "Forbidden" });
      return;
    }

    // 3. Attach user to request for downstream handlers
    req.resolvedUser = user;
    next();
  };
}
