ALTER TABLE sync_conflicts ADD COLUMN flow_id VARCHAR(100);
ALTER TABLE sync_conflicts ADD COLUMN spreadsheet_id TEXT;
ALTER TABLE sync_conflicts ADD COLUMN sheet_name TEXT;
ALTER TABLE sync_conflicts ADD COLUMN id_column TEXT;
CREATE INDEX idx_conflicts_flow_status ON sync_conflicts(flow_id, status);

CREATE TABLE sync_flow_bindings (
    flow_id VARCHAR(100) PRIMARY KEY,
    spreadsheet_id TEXT NOT NULL,
    sheet_name TEXT NOT NULL,
    id_column TEXT NOT NULL,
    columns_json JSONB NOT NULL
);
CREATE TABLE workflow_definitions (
    flow_id VARCHAR(100) PRIMARY KEY,
    definition JSONB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sync_executions (
    id VARCHAR(100) PRIMARY KEY,
    flow_id VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL,
    result JSONB,
    error TEXT,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP
);
CREATE INDEX idx_executions_flow ON sync_executions(flow_id, started_at DESC);
