package com.hybridflow.sync.controller;

import com.hybridflow.sync.service.WorkflowService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {
    private final WorkflowService workflowService;

    @PostMapping("/{id}/retry")
    public void retry(@PathVariable String id) { workflowService.retryNotification(id); }
}
