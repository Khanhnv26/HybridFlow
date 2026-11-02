package com.hybridflow.sync.service;

import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;

public interface SyncExecutionService {

    RunSyncResponse executeSync(RunSyncRequest request);
}
