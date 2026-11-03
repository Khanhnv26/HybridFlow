ALTER TABLE workflow_definitions
    ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(20) NOT NULL DEFAULT 'interval',
    ADD COLUMN IF NOT EXISTS interval_minutes INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS daily_time VARCHAR(10) NOT NULL DEFAULT '08:00',
    ADD COLUMN IF NOT EXISTS access_token TEXT,
    ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_workflow_schedules_due
    ON workflow_definitions (schedule_enabled, next_run_at)
    WHERE schedule_enabled = TRUE;