package com.hybridflow.sync.service;

import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.workspace.dto.response.SheetWritePreviewResponse;

public interface SyncExecutionService {

    RunSyncResponse executeSync(RunSyncRequest request);

    SheetWritePreviewResponse previewSheetWrite(RunSyncRequest request);
}
