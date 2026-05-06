# Implementation Plan: WhatsApp Notification System (Schooliee)
**Updated** – includes Daily Diary (homework) + Student Fee Voucher delivery via WhatsApp

## 1. Objective
Implement the **WhatsApp Notification System** to:
- Send messages directly to parents’ WhatsApp numbers from within Schooliee.
- Deliver **daily diary updates (homework, notes, classwork)** via WhatsApp (in addition to existing SMS).
- Send **student fee vouchers (challans, receipts, payment reminders)** as WhatsApp messages, optionally with attached PDFs.
- Send instant notifications for attendance, fee reminders, exam results, announcements.
- Reduce dependency on manual calls, SMS, or paper notices.
- Log all messages for audit and analytics.

> **Note**: Your existing **Digital Diary** module already sends SMS. This plan adds WhatsApp as an additional channel, preserving SMS as fallback. The fee voucher module complements your existing `FeeService` and `VoucherService`.

## 2. Prerequisites
- WhatsApp Business API credentials (Meta Cloud API or provider like Twilio, 360dialog) supporting media (PDF) upload.
- Existing `parents` table with `phone_number` (validated, international format).
- Existing **Digital Diary** module.
- Existing **Fee & Voucher** modules (`FeeService`, `VoucherService`, `fee_payments`, `vouchers` tables).
- Backend: Express + Drizzle ORM. Frontend: React + TanStack Query.

## 3. Task Breakdown (Priority Order)

### ✅ 3.1 Database Schema
**File**: `server/migrations/YYYYMMDD_whatsapp_notifications.sql`

```sql
-- Message log table (unchanged)
CREATE TABLE whatsapp_messages (
  id SERIAL PRIMARY KEY,
  recipient_number VARCHAR(20) NOT NULL,
  recipient_type VARCHAR(20) DEFAULT 'parent',
  recipient_id INT,
  message_body TEXT NOT NULL,
  template_name VARCHAR(100),
  media_url VARCHAR(255),                         -- URL of attached PDF (voucher)
  media_type VARCHAR(50),                         -- 'application/pdf'
  status VARCHAR(20) DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB                                  -- includes diary_entry_id, voucher_id
);

-- Templates (same as before)
CREATE TABLE whatsapp_templates (...);

-- Add voucher_id reference to fee_vouchers table (if not already linking)
ALTER TABLE fee_vouchers ADD COLUMN whatsapp_sent BOOLEAN DEFAULT false;
ALTER TABLE fee_vouchers ADD COLUMN whatsapp_sent_at TIMESTAMP;

-- Parent opt-in for WhatsApp (add if not exists)
ALTER TABLE parents ADD COLUMN whatsapp_opt_in BOOLEAN DEFAULT true;
ALTER TABLE parents ADD COLUMN whatsapp_phone VARCHAR(20);  -- optional separate number

-- Indexes
CREATE INDEX idx_messages_recipient ON whatsapp_messages(recipient_number, status);
CREATE INDEX idx_messages_voucher ON whatsapp_messages((metadata->>'voucher_id'));