ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "family_id" integer;

CREATE TABLE IF NOT EXISTS "families" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "guardian_details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "wallet_balance" numeric(12, 2) NOT NULL DEFAULT '0',
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
  "updated_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'users_family_id_families_id_fk'
  ) THEN
    ALTER TABLE "users"
    ADD CONSTRAINT "users_family_id_families_id_fk"
    FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "fee_structures" (
  "id" serial PRIMARY KEY NOT NULL,
  "class_name" text NOT NULL,
  "term" text NOT NULL,
  "base_rate" integer NOT NULL DEFAULT 0,
  "transport_rate" integer NOT NULL DEFAULT 0,
  "misc_rate" integer NOT NULL DEFAULT 0,
  "charge_items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "fee_structures_class_term_idx"
ON "fee_structures" ("class_name", "term");

CREATE TABLE IF NOT EXISTS "family_fees" (
  "id" serial PRIMARY KEY NOT NULL,
  "family_id" integer NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "invoice_number" text NOT NULL,
  "billing_month" text NOT NULL,
  "billing_period" text NOT NULL,
  "due_date" text NOT NULL,
  "total_amount" integer NOT NULL,
  "paid_amount" integer NOT NULL DEFAULT 0,
  "remaining_balance" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'Unpaid',
  "student_count" integer NOT NULL DEFAULT 0,
  "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "family_fees_invoice_number_idx"
ON "family_fees" ("invoice_number");

CREATE TABLE IF NOT EXISTS "family_fee_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "family_fee_id" integer NOT NULL REFERENCES "family_fees"("id") ON DELETE CASCADE,
  "fee_id" integer NOT NULL REFERENCES "fees"("id") ON DELETE CASCADE,
  "student_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "family_fee_items_family_fee_fee_idx"
ON "family_fee_items" ("family_fee_id", "fee_id");

CREATE TABLE IF NOT EXISTS "family_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "family_id" integer NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "family_fee_id" integer REFERENCES "family_fees"("id") ON DELETE SET NULL,
  "amount" integer NOT NULL,
  "type" text NOT NULL,
  "method" text,
  "reference" text,
  "notes" text,
  "allocation" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" text NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL
);

ALTER TABLE "fee_payments"
ADD COLUMN IF NOT EXISTS "family_id" integer;

ALTER TABLE "fee_payments"
ADD COLUMN IF NOT EXISTS "family_fee_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fee_payments_family_id_families_id_fk'
  ) THEN
    ALTER TABLE "fee_payments"
    ADD CONSTRAINT "fee_payments_family_id_families_id_fk"
    FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

INSERT INTO "families" ("name", "guardian_details", "wallet_balance", "created_at", "updated_at")
SELECT
  COALESCE(NULLIF(TRIM(u."father_name"), ''), u."name") || ' Family',
  jsonb_build_object(
    'primary',
    jsonb_build_object(
      'name', u."father_name",
      'phone', u."phone",
      'address', u."address"
    )
  ),
  '0',
  CURRENT_TIMESTAMP::text,
  CURRENT_TIMESTAMP::text
FROM "users" u
WHERE u."role" = 'student'
  AND u."family_id" IS NULL
  AND COALESCE(NULLIF(TRIM(u."father_name"), ''), NULL) IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE "users" u
SET "family_id" = f."id"
FROM "families" f
WHERE u."role" = 'student'
  AND u."family_id" IS NULL
  AND f."name" = COALESCE(NULLIF(TRIM(u."father_name"), ''), u."name") || ' Family';
