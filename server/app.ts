import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes.js";
import { serveStatic } from "./static.js";
import { scheduleDailyTeachingPulseCron } from "./generate-pulse.js";
import { attachSocketServer } from "./socket.js";
import { recoverStaleVoucherJobs, scheduleVoucherJobHealthCheck } from "./services/voucherService.js";
import { initRateLimiters } from "./middleware/rateLimiter.js";
import { startPayrollReconciliationJob } from "./services/payrollReconciliationJob.js";

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
      // ── Reports management module tables ─────────────────────────────
      await db.execute(sql`DO $$ BEGIN CREATE TYPE report_category AS ENUM ('academic','fee','finance','attendance'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS report_definitions (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, category report_category NOT NULL, description TEXT, parameters JSONB, query_template TEXT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS report_history (id SERIAL PRIMARY KEY, report_definition_id INTEGER REFERENCES report_definitions(id) ON DELETE SET NULL, generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL, parameters_used JSONB, file_url VARCHAR(500), file_size INTEGER, generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, download_count INTEGER NOT NULL DEFAULT 0);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_report_history_user ON report_history(generated_by);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_report_history_date ON report_history(generated_at);`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS report_cache (id SERIAL PRIMARY KEY, report_key VARCHAR(255) NOT NULL UNIQUE, data JSONB NOT NULL, generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TIMESTAMP);`);

      // ── Activity Logs table for audit trail ───────────────────────────
      await db.execute(sql`CREATE TABLE IF NOT EXISTS activity_logs (id BIGSERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, user_email TEXT NOT NULL, user_role TEXT NOT NULL, action TEXT NOT NULL CHECK (action IN ('CREATE','UPDATE','DELETE','LOGIN','LOGOUT','EXPORT','VIEW','APPROVE','REJECT')), entity_type TEXT NOT NULL, entity_id INTEGER, old_values JSONB, new_values JSONB, ip_address TEXT, user_agent TEXT, request_method TEXT, request_path TEXT, status_code INTEGER, duration_ms INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_activity_logs_user_email ON activity_logs(user_email);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);`);
      // Retention policy function
      await db.execute(sql`CREATE OR REPLACE FUNCTION delete_old_activity_logs(retention_days INT DEFAULT 365) RETURNS VOID AS $$ BEGIN DELETE FROM activity_logs WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL; END; $$ LANGUAGE plpgsql;`);

      // ── Todos table for personal task management ───────────────────────
      await db.execute(sql`CREATE TABLE IF NOT EXISTS public.todos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        assigned_to INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
        assigned_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
        class_id INTEGER REFERENCES public.classes(id) ON DELETE SET NULL,
        due_date TIMESTAMP WITH TIME ZONE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        priority VARCHAR(10) NOT NULL DEFAULT 'medium',
        completed_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS todos_assigned_to_idx ON public.todos(assigned_to);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS todos_assigned_by_idx ON public.todos(assigned_by);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS todos_class_idx ON public.todos(class_id);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS todos_status_idx ON public.todos(status);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS todos_priority_idx ON public.todos(priority);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS todos_due_date_idx ON public.todos(due_date);`);

      await db.execute(sql`ALTER TABLE fees ADD COLUMN IF NOT EXISTS paid_amount integer NOT NULL DEFAULT 0;`);
      await db.execute(sql`ALTER TABLE fees ADD COLUMN IF NOT EXISTS total_discount integer NOT NULL DEFAULT 0;`);
      await db.execute(sql`ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS discount integer NOT NULL DEFAULT 0;`);
      await db.execute(sql`ALTER TABLE fee_payments ADD COLUMN IF NOT EXISTS discount_reason text;`);
      await db.execute(sql`ALTER TABLE finance_voucher_operations ADD COLUMN IF NOT EXISTS error_log jsonb NOT NULL DEFAULT '[]'::jsonb;`);
      // Update remaining_balance to ensure consistency
      // ── My School Module — campuses & billing_records ──────────────────
      await db.execute(sql`CREATE TABLE IF NOT EXISTS public.campuses (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        subdomain VARCHAR(60) NOT NULL UNIQUE,
        address TEXT NOT NULL,
        contact_info JSONB NOT NULL DEFAULT '{}'::jsonb,
        logo_url VARCHAR(500),
        owner_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );`);

      await db.execute(sql`DO $$ BEGIN
        CREATE TYPE billing_status AS ENUM ('PAID','PENDING','OVERDUE','CANCELLED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;`);

      await db.execute(sql`CREATE TABLE IF NOT EXISTS public.billing_records (
        id SERIAL PRIMARY KEY,
        campus_id INTEGER NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
        amount_paise INTEGER NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'PKR',
        status billing_status NOT NULL DEFAULT 'PENDING',
        billing_month INTEGER NOT NULL,
        billing_year INTEGER NOT NULL,
        due_date DATE NOT NULL,
        paid_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );`);

      // ── Add campus_id FK columns to existing tables ──────────────────────
      await db.execute(sql`ALTER TABLE public.students ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES public.campuses(id) ON DELETE SET NULL;`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_students_campus ON public.students(campus_id);`);
      await db.execute(sql`ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES public.campuses(id) ON DELETE SET NULL;`);
      await db.execute(sql`ALTER TABLE public.families ADD COLUMN IF NOT EXISTS campus_id INTEGER REFERENCES public.campuses(id) ON DELETE SET NULL;`);

      await db.execute(sql`UPDATE fees SET remaining_balance = GREATEST(amount - paid_amount - total_discount, 0) WHERE remaining_balance IS NULL OR remaining_balance > 0;`);
      console.log("Database schema alignment successful.");
    } catch (err) {
      console.error("Database schema alignment failed:", err);
    }

    // Initialise rate limiters before routes are registered so that
    // financeRateLimiterSync is ready when the first request arrives.
    try {
      await initRateLimiters();
    } catch (err) {
      console.error("Rate limiter initialisation failed (non-fatal):", err);
    }

    await registerRoutes(httpServer, app);

    try {
      await recoverStaleVoucherJobs();
    } catch (err) {
      console.error("Voucher operation recovery failed:", err);
    }

    // Schedule background cron jobs
    scheduleDailyTeachingPulseCron();
    scheduleVoucherJobHealthCheck();
    startPayrollReconciliationJob();

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
