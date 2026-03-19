import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes.js";
import { serveStatic } from "./static.js";
import { scheduleDailyTeachingPulseCron } from "./generate-pulse.js";
import { attachSocketServer } from "./socket.js";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export const app = express();
export const httpServer = createServer(app);

let initializePromise: Promise<void> | undefined;

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

export async function initializeApp() {
  if (initializePromise) {
    await initializePromise;
    return app;
  }

  initializePromise = (async () => {
    // Attach Socket.io server
    attachSocketServer(httpServer);

    // Guaranteed DB schema alignment on startup
    try {
      const { sql } = await import("drizzle-orm");
      const { db } = await import("./db.js");
      console.log("Checking database schema alignment...");
      await db.execute(sql`ALTER TABLE fees ADD COLUMN IF NOT EXISTS paid_amount integer NOT NULL DEFAULT 0;`);
      await db.execute(sql`ALTER TABLE fees ADD COLUMN IF NOT EXISTS total_discount integer NOT NULL DEFAULT 0;`);
      await db.execute(sql`ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS discount integer NOT NULL DEFAULT 0;`);
      await db.execute(sql`ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS discount_reason text;`);
      // Update remaining_balance to ensure consistency
      await db.execute(sql`UPDATE fees SET remaining_balance = GREATEST(amount - paid_amount - total_discount, 0) WHERE remaining_balance IS NULL OR remaining_balance > 0;`);
      console.log("Database schema alignment successful.");
    } catch (err) {
      console.error("Database schema alignment failed:", err);
    }

    await registerRoutes(httpServer, app);

    // Schedule background cron jobs
    scheduleDailyTeachingPulseCron();

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      console.error("Internal Server Error:", err);

      if (res.headersSent) {
        return next(err);
      }

      return res.status(status).json({ message });
    });

    if (process.env.NODE_ENV === "production") {
      if (!process.env.VERCEL) {
        serveStatic(app);
      }
      return;
    }

    const { setupVite } = await import("./vite.js");
    await setupVite(httpServer, app);
  })();

  await initializePromise;
  return app;
}