/**
 * @file rateLimiter.ts
 * @description Express rate-limiting middleware for financial and sensitive
 *   endpoints.
 *
 * Uses the `express-rate-limit` package (v7+).  Two limiters are exported:
 *
 * | Export              | Window  | Max requests | Applied to                          |
 * |---------------------|---------|--------------|-------------------------------------|
 * | `financeRateLimiter`| 60 s    | 120          | `/api/fees/*`, `/api/vouchers/*`,    |
 * |                     |         |              | `/api/student/history`              |
 * | `globalRateLimiter` | 60 s    | 300          | All API routes (optional baseline)  |
 *
 * Rate-limiting is only enforced in production (`NODE_ENV === "production"`).
 * In development/test the limiters are replaced with a pass-through so tests
 * are not affected.
 *
 * @module server/middleware/rateLimiter
 */

import type { Request, Response, NextFunction } from "express";

// ── Conditional import ─────────────────────────────────────────────────────
// `express-rate-limit` is an optional dependency; if it is not installed the
// module falls back to a no-op middleware so the server still starts.

type RateLimitMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => void;

const isProduction = process.env.NODE_ENV === "production";

/**
 * Build a rate-limiter or return a no-op middleware.
 *
 * @param windowMs  - Time window in milliseconds.
 * @param max       - Maximum number of requests per window per IP.
 * @param message   - JSON error message sent when the limit is exceeded.
 */
async function buildLimiter(
  windowMs: number,
  max: number,
  message: string
): Promise<RateLimitMiddleware> {
  if (!isProduction) {
    // In development / test: always pass through
    return (_req, _res, next) => next();
  }

  try {
    const { rateLimit } = await import("express-rate-limit");
    return rateLimit({
      windowMs,
      max,
      standardHeaders: true,   // Return rate-limit info in `RateLimit-*` headers
      legacyHeaders: false,     // Disable `X-RateLimit-*` headers
      message: { success: false, error: message },
      skipSuccessfulRequests: false,
    }) as unknown as RateLimitMiddleware;
  } catch {
    // express-rate-limit not installed — warn and fall back to no-op
    console.warn(
      "[RateLimiter] express-rate-limit is not installed. " +
        "Rate limiting is DISABLED. Run `npm install express-rate-limit` to enable it."
    );
    return (_req, _res, next) => next();
  }
}

// ── Singleton promises ─────────────────────────────────────────────────────

let _financeRateLimiterPromise: Promise<RateLimitMiddleware> | null = null;
let _globalRateLimiterPromise: Promise<RateLimitMiddleware> | null = null;

/**
 * Rate limiter for financial and history endpoints.
 *
 * Config: 120 requests per 60 seconds per IP.
 *
 * @example
 * ```ts
 * import { financeRateLimiter } from "../middleware/rateLimiter.js";
 * app.get("/api/fees", await financeRateLimiter(), handler);
 * ```
 */
export async function financeRateLimiter(): Promise<RateLimitMiddleware> {
  if (!_financeRateLimiterPromise) {
    _financeRateLimiterPromise = buildLimiter(
      60_000,
      120,
      "Too many requests to financial endpoints. Please try again later."
    );
  }
  return _financeRateLimiterPromise;
}

/**
 * Broad rate limiter for all API routes.
 *
 * Config: 300 requests per 60 seconds per IP.
 */
export async function globalRateLimiter(): Promise<RateLimitMiddleware> {
  if (!_globalRateLimiterPromise) {
    _globalRateLimiterPromise = buildLimiter(
      60_000,
      300,
      "Too many requests. Please slow down."
    );
  }
  return _globalRateLimiterPromise;
}

/**
 * Synchronous wrapper — resolves the finance limiter eagerly at module load
 * time so it can be used inline in route definitions without `await`.
 *
 * Call `initRateLimiters()` once during server startup.
 */
let _financeMiddleware: RateLimitMiddleware = (_req, _res, next) => next();
let _globalMiddleware: RateLimitMiddleware = (_req, _res, next) => next();

export async function initRateLimiters(): Promise<void> {
  _financeMiddleware = await financeRateLimiter();
  _globalMiddleware = await globalRateLimiter();
  console.log("[RateLimiter] Rate limiters initialised.");
}

/**
 * Synchronous finance rate-limiter middleware.
 * Only valid after `initRateLimiters()` has been awaited.
 */
export const financeRateLimiterSync: RateLimitMiddleware = (req, res, next) =>
  _financeMiddleware(req, res, next);

/**
 * Synchronous global rate-limiter middleware.
 * Only valid after `initRateLimiters()` has been awaited.
 */
export const globalRateLimiterSync: RateLimitMiddleware = (req, res, next) =>
  _globalMiddleware(req, res, next);
