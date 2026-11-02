ALTER TABLE sync_conflicts ADD COLUMN IF NOT EXISTS observations_json JSONB;
CREATE TABLE sheet_write_journal (
    id VARCHAR(36) PRIMARY KEY,
    plans JSONB NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX sheet_write_journal_pending ON sheet_write_journal(status) WHERE status = 'PENDING';
