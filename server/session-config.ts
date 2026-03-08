import type { CookieOptions } from "express-session";

const DEFAULT_DEV_SESSION_SECRET = "school-nexus-secret-key";
const ONE_WEEK_IN_MS = 1000 * 60 * 60 * 24 * 7;

export function isProductionEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "production";
}

export function isVercelEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.VERCEL);
}

export function shouldUseSecureSessionCookies(env: NodeJS.ProcessEnv = process.env) {
  return isProductionEnvironment(env) && isVercelEnvironment(env);
}

export function resolveSessionSecret(env: NodeJS.ProcessEnv = process.env) {
  const secret = env.SESSION_SECRET?.trim();
  if (secret) return secret;

  if (isVercelEnvironment(env)) {
    throw new Error("SESSION_SECRET must be set for Vercel deployments");
  }

  return DEFAULT_DEV_SESSION_SECRET;
}

export function buildSessionCookieConfig(isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: ONE_WEEK_IN_MS,
  };
}
