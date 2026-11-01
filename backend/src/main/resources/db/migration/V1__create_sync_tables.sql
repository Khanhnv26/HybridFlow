CREATE TABLE IF NOT EXISTS sync_conflicts (
    id BIGSERIAL PRIMARY KEY,
    record_id VARCHAR(100) NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    base_value TEXT,
    value_a TEXT,
    value_b TEXT,
    resolved_value TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'OPEN', -- OPEN, RESOLVED, IGNORED
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITHOUT TIME ZONE
    );

CREATE INDEX idx_sync_conflicts_status ON sync_conflicts(status);
CREATE INDEX idx_sync_conflicts_record ON sync_conflicts(record_id);