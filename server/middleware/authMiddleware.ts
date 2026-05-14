import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage.ts";
import type { User } from "../../shared/schema.js";

declare module "express" {
  interface Request {
    resolvedUser?: User;
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId: number | undefined = req.session?.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: "Not authenticated" });
    return;
  }

  try {
    const user = await storage.getUser(userId);
    if (!user) {
      res.status(401).json({ success: false, error: "Not authenticated" });
      return;
    }
    req.resolvedUser = user;
    next();
  } catch {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}
