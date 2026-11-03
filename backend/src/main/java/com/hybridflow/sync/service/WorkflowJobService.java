package com.hybridflow.sync.service;

public interface WorkflowJobService {
    void enqueueDue();
    void runNext();
}
