ALTER TABLE sync_flow_bindings
    ADD COLUMN IF NOT EXISTS endpoints_json JSONB;

ALTER TABLE sync_conflicts
    ADD COLUMN IF NOT EXISTS endpoints_json JSONB,
    ADD COLUMN IF NOT EXISTS candidates_json JSONB;