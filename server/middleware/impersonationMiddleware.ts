import type { Request, Response, NextFunction } from "express";

declare module "express" {
  interface Request {
    originalUser?: { id: number; role: string };
    impersonationToken?: string;
  }
}

interface ImpersonationTokenPayload {
  targetUserId: number;
  targetRole: string;
  originalUserId: number;
  expiresAt: number;
}

function verifyImpersonationToken(token: string): ImpersonationTokenPayload {
  const decoded = JSON.parse(
    Buffer.from(token, "base64url").toString("utf-8")
  ) as ImpersonationTokenPayload;

  if (
    !decoded.targetUserId ||
    !decoded.targetRole ||
    !decoded.originalUserId ||
    !decoded.expiresAt
  ) {
    throw new Error("Invalid impersonation token structure");
  }

  return decoded;
}

export function impersonationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.headers["x-impersonation-token"] as string | undefined;
  if (!token) {
    next();
    return;
  }

  try {
    const decoded = verifyImpersonationToken(token);
    if (decoded.expiresAt < Date.now()) {
      res.status(401).json({
        success: false,
        message: "Impersonation session expired",
      });
      return;
    }

    req.originalUser = (req as any).user as { id: number; role: string };
    (req as any).user = {
      id: decoded.targetUserId,
      role: decoded.targetRole,
    };
    req.impersonationToken = token;
  } catch {
    res.status(401).json({
      success: false,
      message: "Invalid impersonation token",
    });
    return;
  }

  next();
}
