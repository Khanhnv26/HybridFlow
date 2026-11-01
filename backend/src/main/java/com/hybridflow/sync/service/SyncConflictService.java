package com.hybridflow.sync.service;

import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.SyncDiffResult;

import java.util.List;

public interface SyncConflictService {

    List<SyncConflict> saveConflicts(SyncDiffResult diffResult);
    void resolveConflict(Long conflictId, String finalValue);
}
