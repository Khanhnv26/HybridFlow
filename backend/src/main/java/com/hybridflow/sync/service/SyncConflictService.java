package com.hybridflow.sync.service;

import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import com.hybridflow.sync.dto.response.TelegramAlertResponse;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SyncDiffResult;

import java.util.List;
import java.util.Map;

public interface SyncConflictService {
    List<SyncConflict> saveConflicts(SyncDiffResult diffResult, RunSyncRequest context, String sheetName);
    SyncConflict saveMultiSheetConflict(
            RunSyncRequest context,
            List<SheetEndpointRequest> endpoints,
            String recordId,
            String columnName,
            String baseValue,
            Map<String, List<String>> changedByValue,
            List<String> currentValuesPerSheet
    );
    void retainOpenConflicts(String flowId, List<Long> retainedIds);
    SyncConflict resolveConflict(Long conflictId, String finalValue, String accessToken);
    TelegramAlertResponse resendTelegramAlert(Long conflictId, String chatId);
    SyncConflict getConflictById(Long conflictId);
    List<SyncConflict> getOpenConflicts(String flowId);
}
