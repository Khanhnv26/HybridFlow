package com.hybridflow.sync.service;

import com.hybridflow.sync.dto.request.ActionPlan;
import com.hybridflow.sync.dto.request.RouterPlan;
import com.hybridflow.sync.model.RecordChangeEvent;

import java.util.List;
import java.util.Set;

public interface RuleEvaluationService {
    void validate(List<RouterPlan> routers, List<ActionPlan> actions, Set<String> availableColumns);
    boolean matches(RouterPlan router, RecordChangeEvent event);
}
