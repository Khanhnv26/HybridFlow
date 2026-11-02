package com.hybridflow.sync.controller;

import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.service.SyncExecutionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/sync")
@RequiredArgsConstructor
public class SyncExecutionController {

    private final SyncExecutionService syncExecutionService;

    @PostMapping("/run")
    public ResponseEntity<RunSyncResponse> runSyncWorkFlow(@RequestBody RunSyncRequest request) {
        RunSyncResponse response = syncExecutionService.executeSync(request);
        return ResponseEntity.ok(response);
    }
}
