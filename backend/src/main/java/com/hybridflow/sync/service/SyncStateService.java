package com.hybridflow.sync.service;

import com.hybridflow.sync.dto.request.SheetEndpointRequest;

import java.util.List;
import java.util.Map;

public interface SyncStateService {
    void lock(String flowId);
    Map<String, String> getSnapshot(String flowId, String recordId);
    Map<String, String> getVaultRecord(String flowId, String recordId);
    Long getSnapshotRevision(String flowId, String recordId);
    void saveSnapshot(String flowId, String recordId, Map<String, String> data);
    void saveVaultRecord(String flowId, String recordId, Map<String, String> data);
    void bind(String flowId, String spreadsheetId, String sheetName, String idColumn, List<String> headers, String storageName);
    void bindMultiSheets(String flowId, List<SheetEndpointRequest> endpoints, String idColumn, List<String> commonColumns);
    List<String> getSnapshotRecordIds(String flowId);
    boolean hasSnapshots(String flowId);
    List<Map<String, String>> getVaultRecords(String flowId);
}
