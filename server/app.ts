import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { registerRoutes } from "./routes.js";
import { serveStatic } from "./static.js";
import superAdminRouter from "./routes/superAdminRouter.js";
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

    // Ensure uploads directory exists
    const uploadsDir = path.resolve(__dirname, "public", "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });

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

      // ── JazzCash payment intents table ────────────────────────────
      await db.execute(sql`CREATE TABLE IF NOT EXISTS public.jazzcash_payment_intents (
        id                    SERIAL PRIMARY KEY,
        family_id             INTEGER NOT NULL REFERENCES public.families(id) ON DELETE RESTRICT,
        pp_txn_ref_no         VARCHAR(50)  NOT NULL UNIQUE,
        pp_response_code      VARCHAR(10),
        pp_response_message   VARCHAR(255),
        requested_amount_pkr  NUMERIC(12,2) NOT NULL,
        applied_amount_pkr    NUMERIC(12,2),
        currency              VARCHAR(3) NOT NULL DEFAULT 'PKR',
        status                TEXT NOT NULL DEFAULT 'PENDING',
        initiated_by_user_id  INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
        raw_callback_payload  JSONB NOT NULL DEFAULT '{}'::jsonb,
        idempotency_key       VARCHAR(100) UNIQUE,
        created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
        completed_at          TEXT,
        updated_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
      );`);
      // Fix: Add missing pp_txn_ref_no column if table exists but column doesn't
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS pp_txn_ref_no VARCHAR(50) UNIQUE;`);
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS pp_response_code VARCHAR(10);`);
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS pp_response_message VARCHAR(255);`);
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS requested_amount_pkr NUMERIC(12,2);`);
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS applied_amount_pkr NUMERIC(12,2);`);
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'PKR';`);
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDING';`);
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS initiated_by_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL;`);
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS raw_callback_payload JSONB DEFAULT '{}'::jsonb;`);
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100) UNIQUE;`);
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS created_at TEXT DEFAULT CURRENT_TIMESTAMP::text;`);
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS completed_at TEXT;`);
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS updated_at TEXT DEFAULT CURRENT_TIMESTAMP::text;`);

      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_jcp_family_id ON public.jazzcash_payment_intents (family_id);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_jcp_txnref ON public.jazzcash_payment_intents (pp_txn_ref_no);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_jcp_status ON public.jazzcash_payment_intents (status);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_jcp_created_at ON public.jazzcash_payment_intents (created_at DESC);`);
      // Make family_id nullable for platform-level transactions
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ALTER COLUMN family_id DROP NOT NULL;`);
      // Add billing_record_id column for platform billing payments
      await db.execute(sql`ALTER TABLE public.jazzcash_payment_intents ADD COLUMN IF NOT EXISTS billing_record_id INTEGER REFERENCES public.billing_records(id) ON DELETE SET NULL;`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_jcp_billing_record ON public.jazzcash_payment_intents (billing_record_id);`);
      console.log("JazzCash payment intents table ready.");

      // ── Platform Management — owners table ──────────────────────────
      await db.execute(sql`DO $$ BEGIN
        CREATE TYPE owner_status AS ENUM ('ACTIVE','SUSPENDED','ON_TRIAL','CANCELLED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;`);
      await db.execute(sql`DO $$ BEGIN
        CREATE TYPE owner_plan AS ENUM ('STARTER','PROFESSIONAL','ENTERPRISE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;`);
      await db.execute(sql`CREATE TABLE IF NOT EXISTS public.owners (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        plan owner_plan NOT NULL DEFAULT 'STARTER',
        status owner_status NOT NULL DEFAULT 'ACTIVE',
        suspended_at TIMESTAMP,
        suspended_reason TEXT,
        grace_period_days INTEGER NOT NULL DEFAULT 30,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );`);

      // ── Platform Management — audit_logs table ──────────────────────
      await db.execute(sql`CREATE TABLE IF NOT EXISTS public.audit_logs (
        id SERIAL PRIMARY KEY,
        actor_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        target_owner_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_id);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs(action);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_target_owner ON public.audit_logs(target_owner_id);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at);`);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_entity ON public.audit_logs(entity_type, entity_id, action, created_at);`);

      // ── Platform Management — platform_settings table ───────────────
      await db.execute(sql`CREATE TABLE IF NOT EXISTS public.platform_settings (
        id SERIAL PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        value JSONB NOT NULL,
        description TEXT,
        category TEXT NOT NULL DEFAULT 'general',
        is_encrypted BOOLEAN NOT NULL DEFAULT false,
        updated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );`);

      // ── Seed default platform settings ──────────────────────────────
      await db.execute(sql`INSERT INTO public.platform_settings (key, value, description, category)
        SELECT 'grace_period_days', '30'::jsonb, 'Days after due date before auto-suspension', 'suspension'
        WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'grace_period_days');`);
      await db.execute(sql`INSERT INTO public.platform_settings (key, value, description, category)
        SELECT 'trial_period_days', '14'::jsonb, 'Days in trial period before first invoice', 'suspension'
        WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'trial_period_days');`);
      await db.execute(sql`INSERT INTO public.platform_settings (key, value, description, category)
        SELECT 'monthly_fee_pkr', '5000'::jsonb, 'Default monthly platform fee (Starter plan)', 'billing'
        WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'monthly_fee_pkr');`);
      await db.execute(sql`INSERT INTO public.platform_settings (key, value, description, category)
        SELECT 'professional_fee_pkr', '15000'::jsonb, 'Professional plan monthly fee', 'billing'
        WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'professional_fee_pkr');`);
      await db.execute(sql`INSERT INTO public.platform_settings (key, value, description, category)
        SELECT 'enterprise_fee_pkr', '30000'::jsonb, 'Enterprise plan monthly fee', 'billing'
        WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'enterprise_fee_pkr');`);
      await db.execute(sql`INSERT INTO public.platform_settings (key, value, description, category)
        SELECT 'late_fee_pkr', '500'::jsonb, 'Late payment penalty', 'billing'
        WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'late_fee_pkr');`);
      await db.execute(sql`INSERT INTO public.platform_settings (key, value, description, category)
        SELECT 'impersonation_max_duration_minutes', '60'::jsonb, 'Max impersonation session length', 'impersonation'
        WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'impersonation_max_duration_minutes');`);
      await db.execute(sql`INSERT INTO public.platform_settings (key, value, description, category)
        SELECT 'audit_log_retention_days', '365'::jsonb, 'Days to retain audit logs before archival', 'general'
        WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'audit_log_retention_days');`);
      await db.execute(sql`INSERT INTO public.platform_settings (key, value, description, category)
        SELECT 'min_payment_for_warning', '1000'::jsonb, 'Minimum unpaid amount to trigger warning', 'billing'
        WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings WHERE key = 'min_payment_for_warning');`);

      // ── Seed / upsert default super admin user ─────────────────────
      // Uses ON CONFLICT to ensure the password is always correct on every restart,
      // even if the user was previously created with a different password or
      // if the startup migration runs multiple times.
      await db.execute(sql`INSERT INTO public.users (name, email, password, role)
        VALUES ('Platform Super Admin', 'superadmin@school.edu', 'password123', 'super_admin')
        ON CONFLICT (email) DO UPDATE SET
          password = EXCLUDED.password,
          role = EXCLUDED.role,
          name = EXCLUDED.name;`);
      console.log("Default super admin user seeded / updated.");

      await db.execute(sql`UPDATE fees SET remaining_balance = GREATEST(amount - paid_amount - total_discount, 0) WHERE remaining_balance IS NULL OR remaining_balance > 0;`);

      // ── Migration 0026: Student extended profile fields ─────────────
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS cnic text;`);
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS religion text DEFAULT 'Islam';`);
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS student_discount numeric(10,2) NOT NULL DEFAULT 0;`);
      // Fix: if column was created as integer, convert to numeric
      await db.execute(sql`ALTER TABLE users ALTER COLUMN student_discount TYPE numeric(10,2) USING student_discount::numeric(10,2);`);

      // ── Students table missing columns from migration 0017 ──────────
      await db.execute(sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS academic_session_id integer REFERENCES academic_sessions(id) ON DELETE SET NULL;`);
      await db.execute(sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS previous_session_id integer REFERENCES academic_sessions(id) ON DELETE SET NULL;`);
      await db.execute(sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS promoted_at timestamp;`);
      await db.execute(sql`ALTER TABLE students ADD COLUMN IF NOT EXISTS campus_id integer REFERENCES campuses(id) ON DELETE SET NULL;`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_students_session_lookup ON students(academic_session_id);`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_students_campus ON students(campus_id);`);

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
    app.use("/api/super-admin", superAdminRouter);

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

    // Serve uploaded files (logos, etc.) regardless of environment
    app.use("/uploads", express.static(path.resolve(__dirname, "public", "uploads")));

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
