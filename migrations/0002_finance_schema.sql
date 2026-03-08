CREATE TABLE IF NOT EXISTS "student_billing_profiles" (
  "student_id" integer PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "monthly_amount" integer NOT NULL,
  "due_day" integer DEFAULT 5 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "notes" text,
  "created_at" text NOT NULL,
  "updated_at" text NOT NULL
);

ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "paid_amount" integer;
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "remaining_balance" integer;
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "invoice_number" text;
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "billing_month" text;
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "billing_period" text;
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "description" text;
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "fee_type" text;
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "source" text;
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "generated_month" text;
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "line_items" jsonb;
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "created_at" text;
ALTER TABLE "fees" ADD COLUMN IF NOT EXISTS "updated_at" text;

WITH normalized_fees AS (
  SELECT
    f.id,
    CASE
      WHEN COALESCE(f.due_date, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN substring(f.due_date, 1, 7)
      ELSE to_char(CURRENT_DATE, 'YYYY-MM')
    END AS normalized_billing_month,
    CASE
      WHEN COALESCE(lower(f.status), '') = 'paid' THEN f.amount
      ELSE 0
    END AS normalized_paid_amount
  FROM "fees" f
)
UPDATE "fees" f
SET
  "paid_amount" = COALESCE(f."paid_amount", nf.normalized_paid_amount),
  "remaining_balance" = COALESCE(f."remaining_balance", GREATEST(f."amount" - nf.normalized_paid_amount, 0)),
  "billing_month" = COALESCE(f."billing_month", nf.normalized_billing_month),
  "billing_period" = COALESCE(
    f."billing_period",
    trim(to_char(to_date(nf.normalized_billing_month || '-01', 'YYYY-MM-DD'), 'Month YYYY'))
  ),
  "description" = COALESCE(
    f."description",
    'Legacy school fee for ' || trim(to_char(to_date(nf.normalized_billing_month || '-01', 'YYYY-MM-DD'), 'Month YYYY'))
  ),
  "fee_type" = COALESCE(f."fee_type", 'Monthly Fee'),
  "source" = COALESCE(f."source", 'manual'),
  "line_items" = COALESCE(
    f."line_items",
    jsonb_build_array(
      jsonb_build_object(
        'label',
        COALESCE(
          f."description",
          'Legacy school fee for ' || trim(to_char(to_date(nf.normalized_billing_month || '-01', 'YYYY-MM-DD'), 'Month YYYY'))
        ),
        'amount',
        f."amount"
      )
    )
  ),
  "created_at" = COALESCE(
    f."created_at",
    CASE
      WHEN COALESCE(f.due_date, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN f.due_date || 'T00:00:00.000Z'
      ELSE CURRENT_TIMESTAMP::text
    END
  ),
  "updated_at" = COALESCE(
    f."updated_at",
    CASE
      WHEN COALESCE(f.due_date, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN f.due_date || 'T00:00:00.000Z'
      ELSE CURRENT_TIMESTAMP::text
    END
  )
FROM normalized_fees nf
WHERE f.id = nf.id;

UPDATE "fees"
SET "status" = CASE
  WHEN COALESCE("paid_amount", 0) >= "amount" THEN 'Paid'
  WHEN COALESCE("remaining_balance", 0) > 0 AND COALESCE("due_date", '') < CURRENT_DATE::text THEN 'Overdue'
  WHEN COALESCE("paid_amount", 0) > 0 THEN 'Partially Paid'
  ELSE 'Unpaid'
END;

UPDATE "fees"
SET "invoice_number" = COALESCE("invoice_number", 'INV-LEGACY-' || lpad("id"::text, 5, '0'));

ALTER TABLE "fees" ALTER COLUMN "paid_amount" SET DEFAULT 0;
ALTER TABLE "fees" ALTER COLUMN "remaining_balance" SET DEFAULT 0;
ALTER TABLE "fees" ALTER COLUMN "status" SET DEFAULT 'Unpaid';
ALTER TABLE "fees" ALTER COLUMN "fee_type" SET DEFAULT 'Monthly Fee';
ALTER TABLE "fees" ALTER COLUMN "source" SET DEFAULT 'manual';
ALTER TABLE "fees" ALTER COLUMN "line_items" SET DEFAULT '[]'::jsonb;

ALTER TABLE "fees" ALTER COLUMN "paid_amount" SET NOT NULL;
ALTER TABLE "fees" ALTER COLUMN "remaining_balance" SET NOT NULL;
ALTER TABLE "fees" ALTER COLUMN "billing_month" SET NOT NULL;
ALTER TABLE "fees" ALTER COLUMN "billing_period" SET NOT NULL;
ALTER TABLE "fees" ALTER COLUMN "description" SET NOT NULL;
ALTER TABLE "fees" ALTER COLUMN "fee_type" SET NOT NULL;
ALTER TABLE "fees" ALTER COLUMN "source" SET NOT NULL;
ALTER TABLE "fees" ALTER COLUMN "line_items" SET NOT NULL;
ALTER TABLE "fees" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "fees" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "fee_payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "fee_id" integer NOT NULL REFERENCES "fees"("id") ON DELETE CASCADE,
  "student_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "amount" integer NOT NULL,
  "payment_date" text NOT NULL,
  "method" text NOT NULL,
  "receipt_number" text,
  "reference" text,
  "notes" text,
  "created_at" text NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL
);

INSERT INTO "fee_payments" (
  "fee_id",
  "student_id",
  "amount",
  "payment_date",
  "method",
  "receipt_number",
  "reference",
  "notes",
  "created_at",
  "created_by"
)
SELECT
  f."id",
  f."student_id",
  f."paid_amount",
  CASE
    WHEN COALESCE(f."due_date", '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN f."due_date"
    ELSE substring(f."created_at", 1, 10)
  END,
  'Other',
  'RCT-LEGACY-' || lpad(f."id"::text, 5, '0'),
  'Legacy import',
  'Backfilled from legacy paid fee record',
  f."created_at",
  NULL
FROM "fees" f
LEFT JOIN "fee_payments" fp ON fp."fee_id" = f."id"
WHERE f."paid_amount" > 0
  AND fp."id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "fees_invoice_number_idx"
  ON "fees" ("invoice_number");

CREATE UNIQUE INDEX IF NOT EXISTS "fees_student_generated_month_idx"
  ON "fees" ("student_id", "generated_month");

CREATE UNIQUE INDEX IF NOT EXISTS "fee_payments_receipt_number_idx"
  ON "fee_payments" ("receipt_number");