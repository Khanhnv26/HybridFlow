package com.hybridflow.sync.service;

import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SyncDiffResult;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.response.TelegramAlertResponse;

import java.util.List;

public interface SyncConflictService {

    List<SyncConflict> saveConflicts(SyncDiffResult diffResult, RunSyncRequest context, String sheetName);
    SyncConflict resolveConflict(Long conflictId, String finalValue, String accessToken);
    TelegramAlertResponse resendTelegramAlert(Long conflictId, String chatId);
    SyncConflict getConflictById(Long conflictId);
    List<SyncConflict> getOpenConflicts(String flowId);
}
