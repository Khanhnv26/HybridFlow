package com.hybridflow.sync.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ActionPlan {
    private String nodeId;
    private String connectionId;
    private String channel;
    private String chatId;
    private String recordTemplate;
    private String conflictTemplate;
}
