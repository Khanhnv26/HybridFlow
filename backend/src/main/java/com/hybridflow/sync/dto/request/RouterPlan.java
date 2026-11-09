package com.hybridflow.sync.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RouterPlan {
    private String nodeId;
    private String triggerOn;
    private String matchMode;
    private List<RouterConditionItem> conditions;
    private List<String> actionNodeIds;
    private String sheetWriteNodeId;
}
