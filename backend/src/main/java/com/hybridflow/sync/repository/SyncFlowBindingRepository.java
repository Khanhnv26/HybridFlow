package com.hybridflow.sync.repository;

import com.hybridflow.sync.model.SyncFlowBinding;
import com.hybridflow.sync.support.SyncJsonCodec;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
@RequiredArgsConstructor
public class SyncFlowBindingRepository {
    private final JdbcTemplate jdbc;
    private final SyncJsonCodec codec;

    public Optional<SyncFlowBinding> findByFlowId(String flowId) {
        List<SyncFlowBinding> bindings = jdbc.query(
                "SELECT flow_id,spreadsheet_id,sheet_name,id_column,columns_json::text,storage_name,endpoints_json::text "
                        + "FROM sync_flow_bindings WHERE flow_id=?",
                (resultSet, rowNumber) -> new SyncFlowBinding(
                        resultSet.getString("flow_id"),
                        resultSet.getString("spreadsheet_id"),
                        resultSet.getString("sheet_name"),
                        resultSet.getString("id_column"),
                        codec.decodeColumns(resultSet.getString("columns_json")),
                        resultSet.getString("storage_name"),
                        codec.decodeEndpoints(resultSet.getString("endpoints_json"))
                ),
                flowId
        );
        return bindings.stream().findFirst();
    }

    public void save(SyncFlowBinding binding) {
        String endpointsJson = binding.getEndpoints() == null || binding.getEndpoints().isEmpty()
                ? null
                : codec.encode(binding.getEndpoints());
        jdbc.update(
                "INSERT INTO sync_flow_bindings (flow_id,spreadsheet_id,sheet_name,id_column,columns_json,storage_name,endpoints_json) "
                        + "VALUES (?,?,?,?,?::jsonb,?,?::jsonb)",
                binding.getFlowId(),
                binding.getSpreadsheetId(),
                binding.getSheetName(),
                binding.getIdColumn(),
                codec.encode(binding.getHeaders()),
                binding.getStorageName(),
                endpointsJson
        );
    }
}
