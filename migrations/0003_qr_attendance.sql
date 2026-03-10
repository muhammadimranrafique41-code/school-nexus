CREATE TABLE IF NOT EXISTS "qr_profiles" (
  "user_id" integer PRIMARY KEY NOT NULL,
  "public_id" text NOT NULL,
  "token_ciphertext" text NOT NULL,
  "token_hash" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "issued_at" text NOT NULL,
  "regenerated_at" text NOT NULL,
  "last_used_at" text,
  "last_used_by" integer,
  "generated_by" integer
);

CREATE UNIQUE INDEX IF NOT EXISTS "qr_profiles_public_id_idx" ON "qr_profiles" ("public_id");
CREATE UNIQUE INDEX IF NOT EXISTS "qr_profiles_token_hash_idx" ON "qr_profiles" ("token_hash");

DO $$ BEGIN
 ALTER TABLE "qr_profiles" ADD CONSTRAINT "qr_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "qr_profiles" ADD CONSTRAINT "qr_profiles_last_used_by_users_id_fk" FOREIGN KEY ("last_used_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "qr_profiles" ADD CONSTRAINT "qr_profiles_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "qr_attendance_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "scanned_by" integer NOT NULL,
  "attendance_date" text NOT NULL,
  "scanned_at" text NOT NULL,
  "role_snapshot" text NOT NULL,
  "direction" text NOT NULL,
  "status" text,
  "scan_method" text NOT NULL,
  "terminal_label" text,
  "notes" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "qr_attendance_events_user_day_direction_idx"
  ON "qr_attendance_events" ("user_id", "attendance_date", "direction");

DO $$ BEGIN
 ALTER TABLE "qr_attendance_events" ADD CONSTRAINT "qr_attendance_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "qr_attendance_events" ADD CONSTRAINT "qr_attendance_events_scanned_by_users_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;