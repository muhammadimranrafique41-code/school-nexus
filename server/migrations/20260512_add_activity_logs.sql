-- Migration: Add activity_logs table for audit trail
-- Date: 2026-05-12

-- Create the activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_role TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'VIEW', 'APPROVE', 'REJECT')),
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  request_method TEXT,
  request_path TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_email ON activity_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

-- Retention policy function
CREATE OR REPLACE FUNCTION delete_old_activity_logs(retention_days INT DEFAULT 365)
RETURNS VOID AS $$
BEGIN
  DELETE FROM activity_logs WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE activity_logs IS 'Immutable audit trail for all application activities';
COMMENT ON FUNCTION delete_old_activity_logs IS 'Prune activity logs older than specified retention days';