package com.hybridflow.workspace.controller;

import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.request.UpdateCellRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.dto.response.SpreadsheetMetadataResponse;
import com.hybridflow.connector.google.dto.response.UpdateCellResponse;
import com.hybridflow.workspace.dto.request.CreateTelegramConnectionRequest;
import com.hybridflow.workspace.dto.response.WorkspaceConnectionResponse;
import com.hybridflow.workspace.service.WorkspaceConnectionService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/workspaces")
public class WorkspaceConnectionController {
    private final WorkspaceConnectionService service;

    @PostMapping("/{workspaceId}/connections/google/start")
    public Map<String, String> startGoogleOAuth(@PathVariable UUID workspaceId,
                                                @RequestParam(defaultValue = "Google Sheets") String connectionName,
                                                HttpSession session) {
        String authUrl = service.startGoogleOAuth(workspaceId, connectionName, session);
        return Map.of("url", authUrl);
    }

    @GetMapping("/connections/google/callback")
    public WorkspaceConnectionResponse completeGoogleOAuth(@RequestParam String code,
                                                           @RequestParam String state,
                                                           HttpSession session) {
        return service.completeGoogleOAuth(code, state, session);
    }

    @PostMapping("/{workspaceId}/connections/telegram")
    @ResponseStatus(HttpStatus.CREATED)
    public WorkspaceConnectionResponse createTelegram(@PathVariable UUID workspaceId,
                                                      @Valid @RequestBody CreateTelegramConnectionRequest request) {
        return service.createTelegram(workspaceId, request);
    }

    @GetMapping("/{workspaceId}/connections")
    public List<WorkspaceConnectionResponse> list(@PathVariable UUID workspaceId) {
        return service.list(workspaceId);
    }

    @PostMapping("/{workspaceId}/connections/{connectionId}/grants")
    public void grantRole(@PathVariable UUID workspaceId,
                          @PathVariable String connectionId,
                          @RequestParam(defaultValue = "EDITOR") String role) {
        service.grantRole(workspaceId, connectionId, role);
    }

    @PostMapping("/{workspaceId}/connections/{connectionId}/revoke")
    public void revoke(@PathVariable UUID workspaceId,
                       @PathVariable String connectionId) {
        service.revoke(workspaceId, connectionId);
    }

    @DeleteMapping("/{workspaceId}/connections/{connectionId}")
    public void delete(@PathVariable UUID workspaceId,
                       @PathVariable String connectionId) {
        service.delete(workspaceId, connectionId);
    }

    @GetMapping("/{workspaceId}/connections/{connectionId}/sheets/metadata")
    public SpreadsheetMetadataResponse getSheetMetadata(@PathVariable UUID workspaceId,
                                                         @PathVariable String connectionId,
                                                         @RequestParam String spreadsheetId) {
        return service.getSheetMetadata(workspaceId, connectionId, spreadsheetId);
    }

    @PostMapping("/{workspaceId}/connections/{connectionId}/sheets/read")
    public SheetDataResponse readSheet(@PathVariable UUID workspaceId,
                                       @PathVariable String connectionId,
                                       @RequestBody ReadSheetRequest request) {
        return service.readSheet(workspaceId, connectionId, request);
    }

    @PostMapping("/{workspaceId}/connections/{connectionId}/sheets/update")
    public UpdateCellResponse updateCell(@PathVariable UUID workspaceId,
                                         @PathVariable String connectionId,
                                         @RequestBody UpdateCellRequest request) {
        return service.updateCell(workspaceId, connectionId, request);
    }

    @GetMapping("/{workspaceId}/connections/{connectionId}/telegram/info")
    public Map<String, Object> getTelegramInfo(@PathVariable UUID workspaceId,
                                               @PathVariable String connectionId) {
        return service.getTelegramInfo(workspaceId, connectionId);
    }
}
