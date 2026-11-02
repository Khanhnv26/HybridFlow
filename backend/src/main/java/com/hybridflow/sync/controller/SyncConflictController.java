package com.hybridflow.sync.controller;

import com.hybridflow.notification.service.TelegramNotificationService;
import com.hybridflow.sync.dto.request.ResolveConflictRequest;
import com.hybridflow.sync.dto.response.TelegramAlertResponse;
import com.hybridflow.sync.entity.SyncConflict;
import com.hybridflow.sync.service.SyncConflictService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping({"/api/v1/sync-conflicts", "/api/v1/conflicts"})
@RequiredArgsConstructor
public class SyncConflictController {

    private final SyncConflictService syncConflictService;
    private final TelegramNotificationService telegramNotificationService;

    @GetMapping
    public ResponseEntity<List<SyncConflict>> getOpenConflicts() {
        List<SyncConflict> openConflicts = syncConflictService.getOpenConflicts();
        return ResponseEntity.ok(openConflicts);
    }

    @PostMapping("/{id}/resolve")
    public ResponseEntity<SyncConflict> resolveConflict(@PathVariable("id") Long conflictId,
                                                        @RequestBody ResolveConflictRequest request) {
        syncConflictService.resolveConflict(conflictId, request.getResolvedValue());
        SyncConflict updatedConflict = syncConflictService.getConflictById(conflictId);
        return ResponseEntity.ok(updatedConflict);
    }

    @PostMapping("/{id}/notify")
    public ResponseEntity<TelegramAlertResponse> resendTelegramAlert(@PathVariable("id") Long conflictId) {
        SyncConflict conflict = syncConflictService.getConflictById(conflictId);
        boolean sent = telegramNotificationService.sendConflictAlert(conflict);
        return ResponseEntity.ok(TelegramAlertResponse.builder()
                .id(conflictId)
                .success(sent)
                .message(sent ? "Đã gửi cảnh báo Telegram thành công!" : "Gửi Telegram thất bại!")
                .build());
    }

}
