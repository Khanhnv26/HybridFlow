CREATE TABLE workflow_webhooks
(
    workspace_id     UUID         NOT NULL,
    workflow_id      VARCHAR(100) NOT NULL,
    webhook_token    VARCHAR(64)  NOT NULL UNIQUE,
    enabled          BOOLEAN      NOT NULL DEFAULT true,
    last_payload     JSONB,
    last_received_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, workflow_id),
    FOREIGN KEY (workspace_id, workflow_id)
        REFERENCES workflow_definitions (workspace_id, flow_id) ON DELETE CASCADE
);