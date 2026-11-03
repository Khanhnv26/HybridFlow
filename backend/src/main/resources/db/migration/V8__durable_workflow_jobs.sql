CREATE TABLE google_connections (
    id VARCHAR(50) PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    state VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'
);

ALTER TABLE workflow_definitions
    ADD COLUMN google_connection_id VARCHAR(50) REFERENCES google_connections(id),
    ADD COLUMN schedule_timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    ADD COLUMN schedule_revision BIGINT NOT NULL DEFAULT 1;

-- Previous versions stored server-local timestamps. Existing installations used Vietnam time.
ALTER TABLE workflow_definitions
    ALTER COLUMN next_run_at TYPE TIMESTAMPTZ USING next_run_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
    ALTER COLUMN last_run_at TYPE TIMESTAMPTZ USING last_run_at AT TIME ZONE 'Asia/Ho_Chi_Minh';

-- Legacy bearer tokens cannot be refreshed. Reconnect Google to resume existing schedules.
UPDATE workflow_definitions SET definition = definition - 'accessToken' - 'refreshToken';
ALTER TABLE workflow_definitions DROP COLUMN access_token;

CREATE TABLE workflow_jobs (
    id VARCHAR(36) PRIMARY KEY,
    workflow_id VARCHAR(100) NOT NULL REFERENCES workflow_definitions(flow_id) ON DELETE CASCADE,
    revision BIGINT NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    definition JSONB NOT NULL,
    state VARCHAR(30) NOT NULL DEFAULT 'READY',
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL,
    lease_until TIMESTAMPTZ,
    owner VARCHAR(36),
    error TEXT,
    finished_at TIMESTAMPTZ,
    UNIQUE(workflow_id, revision, scheduled_at)
);
CREATE INDEX idx_workflow_jobs_available ON workflow_jobs(state, available_at);
