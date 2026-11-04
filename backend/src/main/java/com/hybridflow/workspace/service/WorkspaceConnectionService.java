package com.hybridflow.workspace.service;

import com.hybridflow.connector.google.dto.request.ReadSheetRequest;
import com.hybridflow.connector.google.dto.request.UpdateCellRequest;
import com.hybridflow.connector.google.dto.response.SheetDataResponse;
import com.hybridflow.connector.google.dto.response.SpreadsheetMetadataResponse;
import com.hybridflow.connector.google.dto.response.UpdateCellResponse;
import com.hybridflow.workspace.dto.request.CreateTelegramConnectionRequest;
import com.hybridflow.workspace.dto.response.WorkspaceConnectionResponse;
import com.hybridflow.connection.dto.GoogleOAuthCallbackResponse;
import com.hybridflow.notification.dto.response.TelegramLinkResponse;
import com.hybridflow.notification.dto.response.TelegramRecipientResponse;
import com.hybridflow.notification.dto.response.TelegramTestResponse;
import jakarta.servlet.http.HttpSession;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface WorkspaceConnectionService {
    String startGoogleOAuth(UUID workspaceId, String connectionName, HttpSession session);
    WorkspaceConnectionResponse completeGoogleOAuth(String code, String callbackState, HttpSession session);
    GoogleOAuthCallbackResponse completeGoogleOAuthPage(String code, String state, String error, HttpSession session);
    String googleCallbackOrigin();
    TelegramLinkResponse startTelegramLink(UUID workspaceId, String connectionId, String recipientType);
    TelegramLinkResponse pollTelegramLink(UUID workspaceId, String connectionId, String linkId);
    TelegramRecipientResponse checkTelegramRecipient(UUID workspaceId, String connectionId, String chatId, String recipientType);
    TelegramTestResponse sendTelegramTest(UUID workspaceId, String connectionId, String chatId, String recipientType);
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
