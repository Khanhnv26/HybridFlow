package com.hybridflow.sync.service;

import com.hybridflow.sync.dto.request.ActionPlan;
import com.hybridflow.sync.dto.request.RouterPlan;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.NotificationOutboxItem;
import com.hybridflow.sync.model.RecordChangeEvent;

import java.util.List;
import java.util.Set;

public interface NotificationOutboxService {
    void enqueueRecordEvents(String flowId, String executionId, List<RouterPlan> routers, List<ActionPlan> actions, List<RecordChangeEvent> events, Set<String> syncColumns);
    void enqueueConflicts(String flowId, String executionId, List<ActionPlan> actions, List<String> conflictActionIds, List<SyncConflict> conflicts);
    int enqueue(String flowId, String executionId, List<RouterPlan> routers, List<ActionPlan> actions,
                List<RecordChangeEvent> events, Set<String> syncColumns, List<String> conflictActionIds,
                List<SyncConflict> conflicts);
    boolean processNext();
    List<NotificationOutboxItem> getNotifications(String flowId, String executionId, int limit);
    default List<NotificationOutboxItem> getNotifications(String flowId, int limit) {
        return getNotifications(flowId, null, limit);
    }
    void retry(String id);
}
