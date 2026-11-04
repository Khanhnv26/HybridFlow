ALTER TABLE workflow_definitions
    ADD COLUMN workspace_id UUID REFERENCES workspaces(id),
    ADD COLUMN module_id UUID,
    ADD COLUMN name VARCHAR(120) NOT NULL DEFAULT 'Workflow',
    ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN definition_version BIGINT NOT NULL DEFAULT 1,
    ADD CONSTRAINT workflow_workspace_unique UNIQUE(workspace_id,flow_id),
    ADD CONSTRAINT workflow_module_workspace_fk
        FOREIGN KEY(workspace_id,module_id) REFERENCES business_modules(workspace_id,id);

CREATE TABLE flow_contexts (
    flow_id VARCHAR(100) PRIMARY KEY,
    workspace_id UUID NOT NULL,
    workflow_id VARCHAR(100) NOT NULL,
    config_fingerprint VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(workspace_id,workflow_id)
        REFERENCES workflow_definitions(workspace_id,flow_id),
    UNIQUE(workspace_id,workflow_id,config_fingerprint)
);
CREATE INDEX contexts_workflow ON flow_contexts(workspace_id,workflow_id);

CREATE TABLE workflow_permissions (
    workspace_id UUID NOT NULL,
    workflow_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL,
    can_edit BOOLEAN NOT NULL DEFAULT false,
    can_run BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY(workspace_id,workflow_id,user_id),
    FOREIGN KEY(workspace_id,workflow_id)
        REFERENCES workflow_definitions(workspace_id,flow_id),
    FOREIGN KEY(workspace_id,user_id)
        REFERENCES workspace_members(workspace_id,user_id) ON DELETE CASCADE
);

CREATE TABLE workspace_connections (
    id VARCHAR(50) PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    provider VARCHAR(20) NOT NULL CHECK(provider IN ('GOOGLE','TELEGRAM')),
    name VARCHAR(120) NOT NULL,
    state VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    UNIQUE(workspace_id,id)
);

CREATE TABLE connection_role_grants (
    workspace_id UUID NOT NULL,
    connection_id VARCHAR(50) NOT NULL,
    role VARCHAR(10) NOT NULL CHECK(role='EDITOR'),
    PRIMARY KEY(workspace_id,connection_id,role),
    FOREIGN KEY(workspace_id,connection_id)
        REFERENCES workspace_connections(workspace_id,id)
);

CREATE TABLE workflow_connection_bindings (
    workspace_id UUID NOT NULL,
    workflow_id VARCHAR(100) NOT NULL,
    node_id VARCHAR(100) NOT NULL,
    connection_id VARCHAR(50) NOT NULL,
    PRIMARY KEY(workspace_id,workflow_id,node_id),
    FOREIGN KEY(workspace_id,workflow_id)
        REFERENCES workflow_definitions(workspace_id,flow_id),
    FOREIGN KEY(workspace_id,connection_id)
        REFERENCES workspace_connections(workspace_id,id)
);

CREATE TABLE telegram_connections (
    id VARCHAR(50) PRIMARY KEY REFERENCES workspace_connections(id),
    encrypted_bot_token TEXT NOT NULL,
    bot_username VARCHAR(120) NOT NULL
);

ALTER TABLE workflow_jobs ADD COLUMN workspace_id UUID REFERENCES workspaces(id);
ALTER TABLE notification_outbox
    ADD COLUMN workspace_id UUID REFERENCES workspaces(id),
    ADD COLUMN connection_id VARCHAR(50),
    ADD CONSTRAINT outbox_connection_workspace_fk FOREIGN KEY(workspace_id,connection_id)
        REFERENCES workspace_connections(workspace_id,id);

CREATE INDEX jobs_workspace_state ON workflow_jobs(workspace_id,state,available_at);
CREATE INDEX outbox_workspace_state ON notification_outbox(workspace_id,state,available_at);
