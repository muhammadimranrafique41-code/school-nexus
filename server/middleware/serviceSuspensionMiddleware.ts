import type { Request, Response, NextFunction } from "express";

export function serviceSuspensionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = req.resolvedUser as
    | { id: number; role: string; isSuspended?: boolean }
    | undefined;

  if (user?.isSuspended) {
    res.status(402).json({
      success: false,
      error: "Service suspended due to unpaid invoices. Please contact support.",
      code: "SERVICE_SUSPENDED",
    });
    return;
  }

  next();
}
