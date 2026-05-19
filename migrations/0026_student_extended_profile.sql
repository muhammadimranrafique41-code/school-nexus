-- Migration 0026: Student Extended Profile Fields
-- Add CNIC, Religion, and Discount columns to users table

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cnic text,
  ADD COLUMN IF NOT EXISTS religion text DEFAULT 'Islam',
  ADD COLUMN IF NOT EXISTS student_discount numeric(10,2) NOT NULL DEFAULT 0;
