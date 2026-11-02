package com.hybridflow.sync.service;

import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SyncDiffResult;
import com.hybridflow.sync.dto.request.RunSyncRequest;

import java.util.List;

public interface SyncConflictService {

    List<SyncConflict> saveConflicts(SyncDiffResult diffResult, RunSyncRequest context, String sheetName);
    void resolveConflict(Long conflictId, String finalValue, String accessToken);
    SyncConflict getConflictById(Long conflictId);
    List<SyncConflict> getOpenConflicts(String flowId);
}
