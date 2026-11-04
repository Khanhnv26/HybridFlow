package com.hybridflow.workspace.service;

import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.request.UpdateCellRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.dto.response.SpreadsheetMetadataResponse;
import com.hybridflow.connector.google.dto.response.UpdateCellResponse;
import com.hybridflow.workspace.dto.request.CreateTelegramConnectionRequest;
import com.hybridflow.workspace.dto.response.WorkspaceConnectionResponse;
import jakarta.servlet.http.HttpSession;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface WorkspaceConnectionService {
    String startGoogleOAuth(UUID workspaceId, String connectionName, HttpSession session);
    WorkspaceConnectionResponse completeGoogleOAuth(String code, String callbackState, HttpSession session);
    WorkspaceConnectionResponse createTelegram(UUID workspaceId, CreateTelegramConnectionRequest request);
    List<WorkspaceConnectionResponse> list(UUID workspaceId);
    void grantRole(UUID workspaceId, String connectionId, String role);
    void revoke(UUID workspaceId, String connectionId);
    void delete(UUID workspaceId, String connectionId);
    SpreadsheetMetadataResponse getSheetMetadata(UUID workspaceId, String connectionId, String spreadsheetId);
    SheetDataResponse readSheet(UUID workspaceId, String connectionId, ReadSheetRequest request);
    UpdateCellResponse updateCell(UUID workspaceId, String connectionId, UpdateCellRequest request);
    Map<String, Object> getTelegramInfo(UUID workspaceId, String connectionId);
}
