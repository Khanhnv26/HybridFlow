package com.hybridflow.sync.dto.response;

import com.hybridflow.sync.entity.SyncConflict;
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
public class RunSyncResponse {
    private String flowId;
    private int totalRowsProcessed;
    private List<String> cleanRecordIds;
    private List<SyncConflict> conflicts;
    private Set<String> comparedColumns;
    private String latency;
    private String executionId;
    private String status;
    private int notificationsSent;
    private int notificationsFailed;
    private boolean bootstrapRequired;
    private String sheetName;
}
