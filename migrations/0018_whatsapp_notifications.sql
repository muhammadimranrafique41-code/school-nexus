-- Migration: WhatsApp Notification System
-- Adds whatsapp_messages, whatsapp_templates tables and extends
-- finance_vouchers + users tables with WhatsApp tracking columns.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Message log table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                SERIAL PRIMARY KEY,
  recipient_number  VARCHAR(20)  NOT NULL,
  recipient_type    VARCHAR(20)  NOT NULL DEFAULT 'parent',
  recipient_id      INTEGER,                                    -- users.id (parent/student)
  message_body      TEXT         NOT NULL,
  template_name     VARCHAR(100),
  media_url         VARCHAR(500),                               -- URL of attached PDF (voucher)
  media_type        VARCHAR(50),                                -- e.g. 'application/pdf'
  status            VARCHAR(20)  NOT NULL DEFAULT 'pending',    -- pending | sent | delivered | read | failed
  error_message     TEXT,
  wa_message_id     VARCHAR(100),                               -- WhatsApp API message ID for status callbacks
  sent_at           TIMESTAMP WITH TIME ZONE,
  delivered_at      TIMESTAMP WITH TIME ZONE,
  read_at           TIMESTAMP WITH TIME ZONE,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  metadata          JSONB                                       -- { diary_entry_id, voucher_id, fee_id, class_id }
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_recipient
  ON whatsapp_messages (recipient_number, status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_status
  ON whatsapp_messages (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_voucher
  ON whatsapp_messages ((metadata->>'voucher_id'));

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_diary
  ON whatsapp_messages ((metadata->>'diary_entry_id'));

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_recipient_id
  ON whatsapp_messages (recipient_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Templates table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL UNIQUE,   -- matches Meta template name
  category      VARCHAR(50)  NOT NULL,          -- UTILITY | MARKETING | AUTHENTICATION
  language      VARCHAR(10)  NOT NULL DEFAULT 'en',
  body_text     TEXT         NOT NULL,          -- template body with {{1}} placeholders
  header_text   TEXT,
  footer_text   TEXT,
  variables     JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- [{ "key": "student_name", "index": 1 }]
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Extend finance_vouchers with WhatsApp delivery tracking
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE finance_vouchers
  ADD COLUMN IF NOT EXISTS whatsapp_sent        BOOLEAN                  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at     TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS whatsapp_message_id  INTEGER REFERENCES whatsapp_messages(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Extend consolidated_vouchers with WhatsApp delivery tracking
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE consolidated_vouchers
  ADD COLUMN IF NOT EXISTS whatsapp_sent        BOOLEAN                  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at     TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS whatsapp_message_id  INTEGER REFERENCES whatsapp_messages(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Extend users table with WhatsApp opt-in fields
--    (parents are stored as users with role = 'parent' or linked via families)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in   BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_phone    VARCHAR(20);   -- optional separate WhatsApp number

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Seed default templates
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO whatsapp_templates (name, category, language, body_text, header_text, footer_text, variables)
VALUES
  (
    'fee_reminder',
    'UTILITY',
    'en',
    'Dear {{1}}, this is a reminder that the fee of PKR {{2}} for {{3}} ({{4}}) is due on {{5}}. Please pay at your earliest convenience.',
    'Fee Payment Reminder',
    'Schooliee School Management',
    '[{"key":"parent_name","index":1},{"key":"amount","index":2},{"key":"student_name","index":3},{"key":"billing_period","index":4},{"key":"due_date","index":5}]'
  ),
  (
    'fee_voucher_ready',
    'UTILITY',
    'en',
    'Dear {{1}}, the fee voucher for {{2}} ({{3}}) amounting to PKR {{4}} has been generated. Due date: {{5}}. Please find the voucher attached.',
    'Fee Voucher',
    'Schooliee School Management',
    '[{"key":"parent_name","index":1},{"key":"student_name","index":2},{"key":"billing_period","index":3},{"key":"amount","index":4},{"key":"due_date","index":5}]'
  ),
  (
    'homework_diary',
    'UTILITY',
    'en',
    'Dear {{1}}, the homework diary for {{2}} (Class {{3}}) on {{4}} has been published. Subjects: {{5}}.',
    'Homework Diary Update',
    'Schooliee School Management',
    '[{"key":"parent_name","index":1},{"key":"student_name","index":2},{"key":"class_name","index":3},{"key":"date","index":4},{"key":"subjects","index":5}]'
  ),
  (
    'attendance_absent',
    'UTILITY',
    'en',
    'Dear {{1}}, your child {{2}} (Class {{3}}) was marked *Absent* on {{4}}. Please contact the school if this is an error.',
    'Attendance Alert',
    'Schooliee School Management',
    '[{"key":"parent_name","index":1},{"key":"student_name","index":2},{"key":"class_name","index":3},{"key":"date","index":4}]'
  ),
  (
    'payment_received',
    'UTILITY',
    'en',
    'Dear {{1}}, we have received a payment of PKR {{2}} for {{3}} ({{4}}). Receipt No: {{5}}. Thank you!',
    'Payment Confirmation',
    'Schooliee School Management',
    '[{"key":"parent_name","index":1},{"key":"amount","index":2},{"key":"student_name","index":3},{"key":"billing_period","index":4},{"key":"receipt_number","index":5}]'
  )
ON CONFLICT (name) DO NOTHING;
