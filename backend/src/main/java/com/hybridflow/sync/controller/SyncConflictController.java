package com.hybridflow.sync.controller;

import com.hybridflow.sync.dto.request.ResendTelegramAlertRequest;
import com.hybridflow.sync.dto.request.ResolveConflictRequest;
import com.hybridflow.sync.dto.response.TelegramAlertResponse;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.service.SyncConflictService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping({"/api/v1/sync-conflicts", "/api/v1/conflicts"})
@RequiredArgsConstructor
public class SyncConflictController {
    private final SyncConflictService syncConflictService;

    @GetMapping
    public ResponseEntity<List<SyncConflict>> getOpenConflicts(@RequestParam String flowId) {
        return ResponseEntity.ok(syncConflictService.getOpenConflicts(flowId));
    }

    @PostMapping("/{id}/resolve")
    public ResponseEntity<SyncConflict> resolveConflict(@PathVariable("id") Long conflictId,
                                                       @RequestBody ResolveConflictRequest request) {
        return ResponseEntity.ok(syncConflictService.resolveConflict(conflictId, request.getResolvedValue(), request.getAccessToken()));
    }

    @PostMapping("/{id}/notify")
    public ResponseEntity<TelegramAlertResponse> resendTelegramAlert(@PathVariable("id") Long conflictId,
                                                                  @RequestBody ResendTelegramAlertRequest request) {
        return ResponseEntity.ok(syncConflictService.resendTelegramAlert(conflictId, request.getChatId()));
    }
}
