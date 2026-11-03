package com.hybridflow.sync.service;

import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.model.RecordChangeEvent;

import java.util.Set;

public interface NotificationTemplateService {
    void validateTemplate(String template, Set<String> availableColumns);
    void validateConflictTemplate(String template);
    String renderRecordMessage(String template, RecordChangeEvent event, Set<String> syncColumns);
    String renderConflictMessage(String template, SyncConflict conflict);
}
