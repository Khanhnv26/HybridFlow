package com.hybridflow.sync.service.impl;

import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import com.hybridflow.sync.model.SyncFlowBinding;
import com.hybridflow.sync.repository.SyncFlowBindingRepository;
import com.hybridflow.sync.repository.SyncStateRepository;
import com.hybridflow.sync.service.SyncStateService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class SyncStateServiceImpl implements SyncStateService {
    private final SyncStateRepository repository;
    private final SyncFlowBindingRepository bindingRepository;

    @Override
    public void lock(String flowId) {
        repository.lock(flowId);
    }

    @Override
    public Map<String, String> getSnapshot(String flowId, String recordId) {
        return repository.findSnapshot(flowId, recordId);
    }

    @Override
    public Map<String, String> getVaultRecord(String flowId, String recordId) {
        return repository.findVaultRecord(flowId, recordId);
    }

    @Override
    public void saveSnapshot(String flowId, String recordId, Map<String, String> data) {
        repository.saveSnapshot(flowId, recordId, data);
    }

    @Override
    public void saveVaultRecord(String flowId, String recordId, Map<String, String> data) {
        repository.saveVaultRecord(flowId, recordId, data);
    }

    @Override
    public void bind(String flowId, String spreadsheetId, String sheetName, String idColumn, List<String> headers, String storageName) {
        Optional<SyncFlowBinding> existing = bindingRepository.findByFlowId(flowId);
        if (existing.isPresent()) {
            SyncFlowBinding binding = existing.get();
            if (!Objects.equals(binding.getSpreadsheetId(), spreadsheetId)
                    || !Objects.equals(binding.getSheetName(), sheetName)
                    || !Objects.equals(binding.getIdColumn(), idColumn)
                    || !Objects.equals(binding.getStorageName(), storageName)
                    || !Objects.equals(binding.getHeaders(), headers)) {
                throw new IllegalArgumentException("Nguồn hoặc cấu trúc cột đã đổi. Tạo luồng mới và xác nhận khởi tạo lại.");
            }
            return;
        }
        bindingRepository.save(new SyncFlowBinding(flowId, spreadsheetId, sheetName, idColumn, headers, storageName));
    }

    @Override
    public void bindMultiSheets(String flowId, List<SheetEndpointRequest> endpoints, String idColumn, List<String> commonColumns) {
        Optional<SyncFlowBinding> existing = bindingRepository.findByFlowId(flowId);
        SheetEndpointRequest first = endpoints.get(0);
        if (existing.isPresent()) {
            SyncFlowBinding binding = existing.get();
            if (!Objects.equals(binding.getIdColumn(), idColumn)
                    || !Objects.equals(binding.getStorageName(), "multi_sheet")
                    || !Objects.equals(binding.getHeaders(), commonColumns)
                    || !Objects.equals(binding.getEndpoints(), endpoints)) {
                throw new IllegalArgumentException("Nguồn hoặc cấu trúc cột chung giữa các Sheet đã đổi. Tạo luồng mới và xác nhận khởi tạo lại.");
            }
            return;
        }
        bindingRepository.save(new SyncFlowBinding(
                flowId,
                first.getSpreadsheetId(),
                first.getSheetName(),
                idColumn,
                commonColumns,
                "multi_sheet",
                endpoints
        ));
    }

    @Override
    public boolean hasSnapshots(String flowId) {
        return repository.hasSnapshots(flowId);
    }

    @Override
    public List<Map<String, String>> getVaultRecords(String flowId) {
        return repository.findVaultRecords(flowId);
    }
}
