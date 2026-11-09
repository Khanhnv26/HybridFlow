package com.hybridflow.sync.service;

import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.request.SheetWriteTargetPlan;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.workspace.dto.response.SheetWritePreviewResponse;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface SyncExecutionService {

    RunSyncResponse executeSync(RunSyncRequest request);

    SheetWritePreviewResponse previewSheetWrite(RunSyncRequest request);

    SheetWritePreviewResponse previewWebhookAppend(
            String accessToken,
            SheetWriteTargetPlan targetPlan,
            List<Map<String, String>> payloadRows,
            List<String> payloadHeaders
    );

    RunSyncResponse executeWebhookAppend(
            UUID workspaceId,
            String workflowId,
            String contextId,
            String accessToken,
            SheetWriteTargetPlan targetPlan,
            List<Map<String, String>> payloadRows,
            List<String> payloadHeaders
    );
}
