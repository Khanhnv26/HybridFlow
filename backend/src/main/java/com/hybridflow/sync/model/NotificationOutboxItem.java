package com.hybridflow.sync.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationOutboxItem {
    private String id;
    private String flowId;
    private String executionId;
    private String actionNodeId;
    private String channel;
    private String destination;
    private String sourceType;
    private String sourceKey;
    private String message;
    private String state;
    private int attempts;
    private Instant availableAt;
    private Instant leaseUntil;
    private String owner;
    private String lastError;
    private Instant createdAt;
    private Instant sentAt;
}
