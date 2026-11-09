package com.hybridflow.workspace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.service.SyncExecutionService;
import com.hybridflow.workspace.dto.response.WebhookIngressResponse;
import com.hybridflow.workspace.dto.response.WorkflowWebhookResponse;
import com.hybridflow.workspace.model.TenantWorkflowDiagnostic;
import com.hybridflow.workspace.model.TenantWorkflowRow;
import com.hybridflow.workspace.model.WorkflowWebhookRow;
import com.hybridflow.workspace.repository.FlowContextRepository;
import com.hybridflow.workspace.repository.TenantWorkflowRepository;
import com.hybridflow.workspace.repository.WorkflowWebhookRepository;
import com.hybridflow.workspace.repository.WorkspaceConnectionRepository;
import com.hybridflow.workspace.service.impl.WorkflowWebhookServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WorkflowWebhookServiceTest {

    @Mock private WorkflowWebhookRepository webhooks;
    @Mock private TenantWorkflowRepository workflows;
    @Mock private WorkspaceConnectionRepository connections;
    @Mock private FlowContextRepository contexts;
    @Mock private WorkflowAccessService access;
    @Mock private WorkspaceAccessService workspaces;
    @Mock private GoogleCredentialService credentials;
    @Mock private SyncExecutionService syncExecutionService;
    @Mock private PlatformTransactionManager transactionManager;

    private final ObjectMapper mapper = new ObjectMapper();
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-09T12:00:00Z"), ZoneId.of("UTC"));

    private WorkflowWebhookService service;

    private final UUID workspaceId = UUID.randomUUID();
    private final String workflowId = "flow-webhook-1";

    @BeforeEach
    void setup() {
        lenient().when(transactionManager.getTransaction(any(TransactionDefinition.class)))
                .thenReturn(new SimpleTransactionStatus());

        service = new WorkflowWebhookServiceImpl(
                webhooks,
                workflows,
                connections,
                contexts,
                access,
                workspaces,
                credentials,
                syncExecutionService,
                transactionManager,
                mapper,
                clock
        );
    }

    @Test
    void getOrCreateWebhook_whenNotExists_createsAndReturns() {
        when(webhooks.findByWorkflow(workspaceId, workflowId)).thenReturn(Optional.empty());

        WorkflowWebhookResponse response = service.getOrCreateWebhook(workspaceId, workflowId);

        assertNotNull(response.getWebhookToken());
        assertTrue(response.getWebhookPath().contains(response.getWebhookToken()));
        assertTrue(response.isEnabled());
        verify(webhooks).upsertToken(eq(workspaceId), eq(workflowId), anyString(), eq(true));
    }

    @Test
    void rotateToken_generatesNewToken() {
        when(webhooks.findByWorkflow(workspaceId, workflowId)).thenReturn(
                Optional.of(WorkflowWebhookRow.builder()
                        .workspaceId(workspaceId)
                        .workflowId(workflowId)
                        .webhookToken("old-token")
                        .enabled(true)
                        .build()),
                Optional.of(WorkflowWebhookRow.builder()
                        .workspaceId(workspaceId)
                        .workflowId(workflowId)
                        .webhookToken("new-token")
                        .enabled(true)
                        .build())
        );

        WorkflowWebhookResponse response = service.rotateToken(workspaceId, workflowId);

        assertEquals("new-token", response.getWebhookToken());
        verify(webhooks).upsertToken(eq(workspaceId), eq(workflowId), argThat(t -> !t.equals("old-token")), eq(true));
    }

    @Test
    void receive_whenTokenNotFound_throwsNotFound() {
        when(webhooks.findByToken("invalid-tok")).thenReturn(Optional.empty());

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.receive("invalid-tok", mapper.createObjectNode()));
        assertEquals(ErrorCode.RESOURCE_NOT_FOUND, ex.getErrorCode());
    }

    @Test
    void receive_whenDisabled_throwsConflict() {
        when(webhooks.findByToken("tok-disabled")).thenReturn(Optional.of(
                WorkflowWebhookRow.builder()
                        .workspaceId(workspaceId)
                        .workflowId(workflowId)
                        .webhookToken("tok-disabled")
                        .enabled(false)
                        .build()
        ));

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.receive("tok-disabled", mapper.createObjectNode()));
        assertEquals(ErrorCode.STATE_CONFLICT, ex.getErrorCode());
    }

    @Test
    void receive_whenWorkflowDisabled_recordsPayloadAndThrowsConflict() {
        String token = "valid-tok";
        when(webhooks.findByToken(token)).thenReturn(Optional.of(
                WorkflowWebhookRow.builder()
                        .workspaceId(workspaceId)
                        .workflowId(workflowId)
                        .webhookToken(token)
                        .enabled(true)
                        .build()
        ));

        when(workflows.findRunDiagnostic(workspaceId, workflowId)).thenReturn(Optional.of(
                new TenantWorkflowDiagnostic(true, "Flow 1", false, null, null, true)
        ));

        var payload = mapper.createObjectNode().put("ma_hv", "HV-1");

        ApplicationException ex = assertThrows(ApplicationException.class,
                () -> service.receive(token, payload));

        assertEquals(ErrorCode.STATE_CONFLICT, ex.getErrorCode());
        // Verify payload was still recorded
        verify(webhooks).recordPayload(eq(workspaceId), eq(workflowId), anyString(), any());
    }

    @Test
    void receive_whenNotConnectedToSheetWrite_capturesPayloadAndReturnsCapturedStatus() {
        String token = "valid-tok";
        when(webhooks.findByToken(token)).thenReturn(Optional.of(
                WorkflowWebhookRow.builder()
                        .workspaceId(workspaceId)
                        .workflowId(workflowId)
                        .webhookToken(token)
                        .enabled(true)
                        .build()
        ));

        when(workflows.findRunDiagnostic(workspaceId, workflowId)).thenReturn(Optional.of(
                new TenantWorkflowDiagnostic(true, "Flow 1", true, null, null, true)
        ));

        // Definition with only webhookTrigger, not connected to sheetWriteAction
        String definition = """
                {
                  "nodes": [
                    { "id": "wh-1", "type": "webhookTrigger", "data": {} }
                  ],
                  "edges": []
                }
                """;

        when(workflows.findWorkflow(workspaceId, workflowId)).thenReturn(Optional.of(
                TenantWorkflowRow.builder()
                        .workspaceId(workspaceId)
                        .flowId(workflowId)
                        .definitionJson(definition)
                        .build()
        ));

        var payload = mapper.createObjectNode()
                .put("ma_hv", "HV-2404")
                .put("ho_ten", "Nguyễn Minh Anh");

        WebhookIngressResponse response = service.receive(token, payload);

        assertEquals("PAYLOAD_CAPTURED", response.getStatus());
        assertEquals(0, response.getRowsAppended());
        verify(webhooks).recordPayload(eq(workspaceId), eq(workflowId), anyString(), any());
    }

    @Test
    void receive_whenConnectedToSheetWrite_executesAppend() {
        String token = "valid-tok";
        when(webhooks.findByToken(token)).thenReturn(Optional.of(
                WorkflowWebhookRow.builder()
                        .workspaceId(workspaceId)
                        .workflowId(workflowId)
                        .webhookToken(token)
                        .enabled(true)
                        .build()
        ));

        when(workflows.findRunDiagnostic(workspaceId, workflowId)).thenReturn(Optional.of(
                new TenantWorkflowDiagnostic(true, "Flow 1", true, null, null, true)
        ));

        String definition = """
                {
                  "nodes": [
                    { "id": "wh-1", "type": "webhookTrigger", "data": {} },
                    {
                      "id": "sw-1",
                      "type": "sheetWriteAction",
                      "data": {
                        "targetSpreadsheetId": "sheet-tgt",
                        "targetSheetName": "HocVien",
                        "sourceKeyColumn": "ma_hv",
                        "targetKeyColumn": "Mã HV",
                        "columnMappings": [
                          { "sourceColumn": "ho_ten", "targetColumn": "Họ Tên" }
                        ]
                      }
                    }
                  ],
                  "edges": [
                    { "source": "wh-1", "target": "sw-1" }
                  ]
                }
                """;

        when(workflows.findWorkflow(workspaceId, workflowId)).thenReturn(Optional.of(
                TenantWorkflowRow.builder()
                        .workspaceId(workspaceId)
                        .flowId(workflowId)
                        .definitionJson(definition)
                        .build()
        ));

        when(workflows.findBindings(workspaceId, workflowId)).thenReturn(List.of(
                new com.hybridflow.workspace.dto.request.ConnectionBindingItem("sw-1", "conn-1")
        ));
        when(connections.findGoogleConnectionId(workspaceId, "conn-1")).thenReturn(Optional.of("google-conn-id"));
        when(credentials.resolveAccessToken("google-conn-id")).thenReturn("google-token");

        when(syncExecutionService.executeWebhookAppend(any(), any(), any(), any(), any(), any(), any()))
                .thenReturn(RunSyncResponse.builder()
                        .status("SUCCESS")
                        .executionId("exec-101")
                        .cleanRecordIds(List.of("HV-2404"))
                        .targetRowsUpdated(1)
                        .targetCellsUpdated(2)
                        .build());

        var payload = mapper.createObjectNode()
                .put("ma_hv", "HV-2404")
                .put("ho_ten", "Nguyễn Minh Anh");

        WebhookIngressResponse response = service.receive(token, payload);

        assertEquals("SUCCESS", response.getStatus());
        assertEquals("exec-101", response.getExecutionId());
        assertEquals(1, response.getRowsAppended());
        assertEquals(2, response.getCellsWritten());
        assertEquals(List.of("HV-2404"), response.getAppendedKeys());
        verify(syncExecutionService).executeWebhookAppend(
                eq(workspaceId),
                eq(workflowId),
                anyString(),
                eq("google-token"),
                argThat(p -> p.getTargetSpreadSheetId().equals("sheet-tgt") && p.getSourceKeyColumn().equals("ma_hv")),
                any(),
                any()
        );
    }
}
