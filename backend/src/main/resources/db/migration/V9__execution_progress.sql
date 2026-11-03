ALTER TABLE sync_executions ADD COLUMN progress JSONB NOT NULL DEFAULT '[]'::jsonb;
