package com.hybridflow.sync.service.impl;

import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.common.util.ErrorClassifier;
import com.hybridflow.sync.repository.ExecutionHistoryRepository;
import com.hybridflow.sync.service.ExecutionHistoryService;
import com.hybridflow.sync.support.SyncJsonCodec;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ExecutionHistoryServiceImpl implements ExecutionHistoryService {
    private final ExecutionHistoryRepository repository;
    private final SyncJsonCodec codec;

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String start(String flowId) {
        String executionId = UUID.randomUUID().toString();
        repository.start(executionId, flowId);
        return executionId;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void fail(String executionId, Throwable exception) {
        ErrorDetails details = ErrorClassifier.classify(exception);
        repository.fail(executionId, details);
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void finish(String executionId, String status, Object result, String error) {
        repository.finish(executionId, status, result == null ? null : codec.encode(result), error);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Map<String, Object>> list(String flowId) {
        return repository.findByFlowId(flowId);
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void phase(String executionId, List<String> nodeIds, String stage, String label) {
        repository.appendProgress(executionId, codec.encode(Map.of("nodes", nodeIds, "stage", stage, "label", label)));
    }

    @Override
    @Transactional
    public void clear(String flowId) {
        repository.deleteByFlowId(flowId);
    }
}
