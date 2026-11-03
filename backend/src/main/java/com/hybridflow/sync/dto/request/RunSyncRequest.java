package com.hybridflow.sync.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.Set;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RunSyncRequest {
    private String flowId;
    private String accessToken;
    private java.util.Map<String, List<String>> executionNodes;
    private boolean scheduledExecution;
    private String spreadsheetId;
    private String sheetName;
    private List<ColumnTransformConfig> transforms;
    private boolean writeBackCleanData;
    private List<SheetEndpointRequest> sheets;
    @Builder.Default
    private String idColumn = "id";
    private Set<String> syncColumns;
    private boolean bootstrapConfirmed;
    private boolean notifyConflicts;
    private String chatId;
    @Builder.Default
    private String conflictPolicy = "ASK_TELEGRAM";
    @Builder.Default
    private String storageName = "vault";
    private List<RouterPlan> routers;
    private List<ActionPlan> actions;
    private List<String> conflictActionIds;
}
