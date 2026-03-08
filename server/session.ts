import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import {
  buildSessionCookieConfig,
  shouldUseSecureSessionCookies,
  resolveSessionSecret,
} from "./session-config";

const PgSessionStore = connectPgSimple(session);

export function createSessionMiddleware() {
  const useSecureCookies = shouldUseSecureSessionCookies();

  return session({
    name: "school-nexus.sid",
    secret: resolveSessionSecret(),
    resave: false,
    saveUninitialized: false,
    proxy: Boolean(process.env.VERCEL),
    store: new PgSessionStore({
      pool,
      createTableIfMissing: true,
    }),
    cookie: buildSessionCookieConfig(useSecureCookies),
  });
}
