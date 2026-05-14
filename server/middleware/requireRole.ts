import type { Request, Response, NextFunction } from "express";

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.resolvedUser;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({
        success: false,
        error: "Forbidden",
        requiredRoles: roles,
        userRole: user?.role ?? null,
      });
      return;
    }
    next();
  };
}
