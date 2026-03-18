-- Add sandbox tracking columns to builder_sessions
ALTER TABLE builder_sessions
  ADD COLUMN IF NOT EXISTS sandbox_id TEXT,
  ADD COLUMN IF NOT EXISTS sandbox_agent_session_id TEXT,
  ADD COLUMN IF NOT EXISTS sandbox_status TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS sandbox_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sandbox_last_active_at TIMESTAMPTZ;
