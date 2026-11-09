package com.hybridflow.workspace.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.hybridflow.workspace.dto.response.WebhookIngressResponse;
import com.hybridflow.workspace.service.WorkflowWebhookService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/webhooks")
@RequiredArgsConstructor
public class WebhookIngressController {
    private final WorkflowWebhookService service;

    @PostMapping("/{webhookToken}")
    public WebhookIngressResponse receive(@PathVariable String webhookToken,
                                          @RequestBody(required = false) JsonNode payload) {
        return service.receive(webhookToken, payload);
    }
}
