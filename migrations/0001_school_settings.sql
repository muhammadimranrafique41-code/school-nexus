CREATE TABLE IF NOT EXISTS "school_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "data" jsonb NOT NULL,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL,
  "updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "school_settings_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "settings_id" integer NOT NULL REFERENCES "school_settings"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "data" jsonb NOT NULL,
  "change_summary" text,
  "created_at" text NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "school_settings_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "settings_id" integer NOT NULL REFERENCES "school_settings"("id") ON DELETE CASCADE,
  "action" text NOT NULL,
  "category" text,
  "field_path" text,
  "previous_value" text,
  "next_value" text,
  "change_summary" text,
  "created_at" text NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "school_settings_versions_settings_version_idx"
  ON "school_settings_versions" ("settings_id", "version");

CREATE INDEX IF NOT EXISTS "school_settings_audit_logs_settings_created_idx"
  ON "school_settings_audit_logs" ("settings_id", "created_at");