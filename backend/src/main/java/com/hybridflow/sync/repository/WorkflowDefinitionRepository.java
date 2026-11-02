package com.hybridflow.sync.repository;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
@RequiredArgsConstructor
public class WorkflowDefinitionRepository {
    private final JdbcTemplate jdbc;

    public Optional<String> findDefinition(String workflowId) {
        List<String> definitions = jdbc.query(
                "SELECT definition::text FROM workflow_definitions WHERE flow_id=?",
                (resultSet, rowNumber) -> resultSet.getString(1), workflowId);
        return definitions.stream().findFirst();
    }

    public void saveDefinition(String workflowId, String definition) {
        jdbc.update("INSERT INTO workflow_definitions(flow_id,definition) VALUES (?,?::jsonb) "
                        + "ON CONFLICT(flow_id) DO UPDATE SET definition=EXCLUDED.definition,updated_at=CURRENT_TIMESTAMP",
                workflowId, definition);
    }
}
