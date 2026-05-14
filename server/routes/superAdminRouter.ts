import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { eq } from "drizzle-orm";
import { campuses, platformSettings } from "../../shared/schema.js";
import * as superAdminService from "../services/superAdminService.js";
import { auditLogService } from "../services/auditLogService.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

router.use(authMiddleware);
router.use(requireRole("super_admin"));

function getActorId(req: Request): number {
  return req.resolvedUser!.id;
}

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);
}

const createOwnerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().optional(),
  plan: z.enum(["STARTER", "PROFESSIONAL", "ENTERPRISE"]).default("STARTER"),
});

const updateOwnerStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "ON_TRIAL"]),
  reason: z.string().max(500).optional(),
});

router.get(
  "/platform-stats",
  asyncHandler(async (_req, res) => {
    const stats = await superAdminService.getPlatformStats();
    res.json({ success: true, data: stats });
  }),
);

router.get(
  "/owners",
  asyncHandler(async (_req, res) => {
    const data = await superAdminService.getOwners();
    res.json({ success: true, data });
  }),
);

router.get(
  "/owners/:id",
  asyncHandler(async (req, res) => {
    const owner = await superAdminService.getOwnerById(Number(req.params.id));
    if (!owner) {
      res.status(404).json({ success: false, message: "Owner not found" });
      return;
    }
    res.json({ success: true, data: owner });
  }),
);

router.post(
  "/owners",
  asyncHandler(async (req, res) => {
    const parsed = createOwnerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten() });
      return;
    }
    const owner = await superAdminService.createOwner(parsed.data);
    await auditLogService.log({
      actorId: getActorId(req),
      actorRole: "super_admin",
      action: "OWNER_CREATED",
      entityType: "owner",
      entityId: owner.id,
      targetOwnerId: owner.id,
      metadata: { name: parsed.data.name, email: parsed.data.email, plan: parsed.data.plan },
      ipAddress: req.ip,
      userAgent: (req.get("user-agent") as string | undefined) ?? undefined,
    });
    res.status(201).json({ success: true, data: owner });
  }),
);

router.patch(
  "/owners/:id/status",
  asyncHandler(async (req, res) => {
    const parsed = updateOwnerStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten() });
      return;
    }
    const owner = await superAdminService.updateOwnerStatus(
      Number(req.params.id),
      parsed.data.status,
      parsed.data.reason,
      getActorId(req),
    );
    res.json({ success: true, data: owner });
  }),
);

router.get(
  "/owners/:id/campuses",
  asyncHandler(async (req, res) => {
    const data = await superAdminService.getOwnerCampuses(Number(req.params.id));
    res.json({ success: true, data });
  }),
);

router.delete(
  "/owners/:id",
  asyncHandler(async (req, res) => {
    await superAdminService.deleteOwner(Number(req.params.id));
    await auditLogService.log({
      actorId: getActorId(req),
      actorRole: "super_admin",
      action: "OWNER_DELETED",
      entityType: "owner",
      entityId: Number(req.params.id),
      targetOwnerId: Number(req.params.id),
      metadata: {},
      ipAddress: req.ip,
      userAgent: (req.get("user-agent") as string | undefined) ?? undefined,
    });
    res.json({ success: true });
  }),
);

router.get(
  "/billing",
  asyncHandler(async (req, res) => {
    const rawStatus = req.query["status"];
    const status = typeof rawStatus === "string" &&
      ["PAID", "PENDING", "OVERDUE", "CANCELLED"].includes(rawStatus)
      ? (rawStatus as any)
      : undefined;
    const result = await superAdminService.getAllBillingRecords({
      status,
      ownerId: req.query["ownerId"] ? Number(req.query["ownerId"]) : undefined,
      fromDate: req.query["from"] as string,
      toDate: req.query["to"] as string,
      page: req.query["page"] ? Number(req.query["page"]) : 1,
      pageSize: req.query["pageSize"] ? Number(req.query["pageSize"]) : 25,
    });
    res.json({ success: true, ...result });
  }),
);

router.patch(
  "/billing/:id/status",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      status: z.enum(["PAID", "CANCELLED"]),
      notes: z.string().max(500).optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten() });
      return;
    }
    const record = await superAdminService.overrideBillingStatus(
      Number(req.params.id),
      parsed.data.status,
      getActorId(req),
      parsed.data.notes,
    );
    res.json({ success: true, data: record });
  }),
);

router.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    const result = await auditLogService.getLogs({
      action: req.query["action"] as string,
      entityType: req.query["entityType"] as string,
      actorId: req.query["actorId"] ? Number(req.query["actorId"]) : undefined,
      targetOwnerId: req.query["targetOwnerId"] ? Number(req.query["targetOwnerId"]) : undefined,
      fromDate: req.query["from"] as string,
      toDate: req.query["to"] as string,
      page: req.query["page"] ? Number(req.query["page"]) : 1,
      pageSize: req.query["pageSize"] ? Number(req.query["pageSize"]) : 50,
    });
    res.json({ success: true, ...result });
  }),
);

router.get(
  "/system-health",
  asyncHandler(async (_req, res) => {
    const health = await superAdminService.getSystemHealth();
    res.json({ success: true, data: health });
  }),
);

router.post(
  "/impersonate",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      targetUserId: z.number().int().positive(),
      targetRole: z.enum(["owner", "admin"]),
    }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: parsed.error.flatten() });
      return;
    }
    const token = await superAdminService.startImpersonation(
      getActorId(req),
      parsed.data.targetUserId,
      parsed.data.targetRole,
    );
    await auditLogService.log({
      actorId: getActorId(req),
      actorRole: "super_admin",
      action: "IMPERSONATION_START",
      entityType: "user",
      entityId: parsed.data.targetUserId,
      targetOwnerId: parsed.data.targetRole === "owner" ? parsed.data.targetUserId : undefined,
      metadata: { targetRole: parsed.data.targetRole },
      ipAddress: req.ip,
      userAgent: (req.get("user-agent") as string | undefined) ?? undefined,
    });
    res.json({ success: true, data: { impersonationToken: token } });
  }),
);

router.post(
  "/end-impersonation",
  asyncHandler(async (req, res) => {
    await superAdminService.endImpersonation(getActorId(req));
    await auditLogService.log({
      actorId: getActorId(req),
      actorRole: "super_admin",
      action: "IMPERSONATION_END",
      entityType: "user",
      entityId: null,
      metadata: {},
      ipAddress: req.ip,
      userAgent: (req.get("user-agent") as string | undefined) ?? undefined,
    });
    res.json({ success: true });
  }),
);

router.get(
  "/platform-settings",
  asyncHandler(async (_req, res) => {
    const settings = await db.select().from(platformSettings);
    res.json({ success: true, data: settings });
  }),
);

router.patch(
  "/platform-settings/:key",
  asyncHandler(async (req, res) => {
    const key = req.params.key as string;
    const { value } = req.body;
    await superAdminService.updatePlatformSetting(key, value, getActorId(req));
    res.json({ success: true });
  }),
);

export default router;
