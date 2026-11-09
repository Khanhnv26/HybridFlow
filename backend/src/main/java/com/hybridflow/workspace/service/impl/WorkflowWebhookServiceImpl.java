package com.hybridflow.workspace.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.common.exception.ValidationException;
import com.hybridflow.connection.service.GoogleCredentialService;
import com.hybridflow.sync.dto.request.SheetWriteTargetPlan;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.service.SyncExecutionService;
import com.hybridflow.sync.util.FlowContextIds;
import com.hybridflow.workspace.dto.request.ConnectionBindingItem;
import com.hybridflow.workspace.dto.request.SheetWritePreviewRequest;
import com.hybridflow.workspace.dto.response.SheetWritePreviewResponse;
import com.hybridflow.workspace.dto.response.WebhookIngressResponse;
import com.hybridflow.workspace.dto.response.WorkflowWebhookResponse;
import com.hybridflow.workspace.model.TenantWorkflowDiagnostic;
import com.hybridflow.workspace.model.TenantWorkflowRow;
import com.hybridflow.workspace.model.WorkflowWebhookRow;
import com.hybridflow.workspace.model.WorkspaceRole;
import com.hybridflow.workspace.repository.FlowContextRepository;
import com.hybridflow.workspace.repository.TenantWorkflowRepository;
import com.hybridflow.workspace.repository.WorkflowWebhookRepository;
import com.hybridflow.workspace.repository.WorkspaceConnectionRepository;
import com.hybridflow.workspace.service.WorkflowAccessService;
import com.hybridflow.workspace.service.WorkflowWebhookService;
import com.hybridflow.workspace.service.WorkspaceAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
public class WorkflowWebhookServiceImpl implements WorkflowWebhookService {
    private static final SecureRandom RANDOM = new SecureRandom();

    private final WorkflowWebhookRepository webhooks;
    private final TenantWorkflowRepository workflows;
    private final WorkspaceConnectionRepository connections;
    private final FlowContextRepository contexts;
    private final WorkflowAccessService access;
    private final WorkspaceAccessService workspaces;
    private final GoogleCredentialService credentials;
    private final SyncExecutionService syncExecutionService;
    private final PlatformTransactionManager transactionManager;
    private final ObjectMapper mapper;
    private final Clock clock;

    @Override
    @Transactional
    public WorkflowWebhookResponse getOrCreateWebhook(UUID workspaceId, String workflowId) {
        access.requireRead(workspaceId, workflowId);
        WorkflowWebhookRow row = webhooks.findByWorkflow(workspaceId, workflowId)
                .orElseGet(() -> {
                    String token = generateToken();
                    webhooks.upsertToken(workspaceId, workflowId, token, true);
                    return WorkflowWebhookRow.builder()
                            .workspaceId(workspaceId)
                            .workflowId(workflowId)
                            .webhookToken(token)
                            .enabled(true)
                            .build();
                });
        return toResponse(row);
    }

    @Override
    @Transactional
    public WorkflowWebhookResponse rotateToken(UUID workspaceId, String workflowId) {
        access.requireEdit(workspaceId, workflowId);
        WorkflowWebhookRow current = webhooks.findByWorkflow(workspaceId, workflowId).orElse(null);
        boolean enabled = current == null || current.isEnabled();
        String newToken = generateToken();
        webhooks.upsertToken(workspaceId, workflowId, newToken, enabled);
        return webhooks.findByWorkflow(workspaceId, workflowId)
                .map(this::toResponse)
                .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
    }

    @Override
    @Transactional
    public WorkflowWebhookResponse updateEnabled(UUID workspaceId, String workflowId, boolean enabled) {
        access.requireEdit(workspaceId, workflowId);
        WorkflowWebhookRow current = webhooks.findByWorkflow(workspaceId, workflowId)
                .orElseGet(() -> {
                    String token = generateToken();
                    webhooks.upsertToken(workspaceId, workflowId, token, enabled);
                    return WorkflowWebhookRow.builder()
                            .workspaceId(workspaceId)
                            .workflowId(workflowId)
                            .webhookToken(token)
                            .enabled(enabled)
                            .build();
                });
        webhooks.updateEnabled(workspaceId, workflowId, enabled);
        current.setEnabled(enabled);
        return toResponse(current);
    }

    @Override
    @Transactional(readOnly = true)
    public SheetWritePreviewResponse previewWebhookAppend(UUID workspaceId, String workflowId, SheetWritePreviewRequest request) {
        access.requireRead(workspaceId, workflowId);
        if (workspaces.requireMember(workspaceId) == WorkspaceRole.VIEWER) {
            throw new ApplicationException(ErrorCode.ACCESS_DENIED);
        }
        WorkflowWebhookRow webhook = webhooks.findByWorkflow(workspaceId, workflowId)
                .orElseThrow(() -> new ValidationException("Chưa khởi tạo Webhook cho luồng này."));
        if (webhook.getLastPayloadJson() == null || webhook.getLastPayloadJson().isBlank()) {
            throw new ValidationException("Webhook chưa nhận được dữ liệu mẫu. Hãy gửi thử 1 bản ghi trước khi xem trước.");
        }
        JsonNode payload = parseJson(webhook.getLastPayloadJson());
        ParsedPayload parsed = extractPayloadRows(payload);
        String accessToken = resolveGoogleAccessToken(workspaceId, workflowId);

        SheetWriteTargetPlan targetPlan = SheetWriteTargetPlan.builder()
                .targetSpreadSheetId(request.getTargetSpreadSheetId().trim())
                .targetSheetName(request.getTargetSheetName().trim())
                .sourceKeyColumn(request.getSourceKeyColumn().trim())
                .targetKeyColumn(request.getTargetKeyColumn().trim())
                .columnMappings(request.getColumnMappings().stream()
                        .map(m -> new SheetWritePreviewRequest.ColumnMappingItem(
                                m.getSourceColumn().trim(), m.getTargetColumn().trim()))
                        .toList())
                .build();

        return syncExecutionService.previewWebhookAppend(accessToken, targetPlan, parsed.rows(), parsed.headers());
    }

    @Override
    public WebhookIngressResponse receive(String webhookToken, JsonNode payload) {
        if (webhookToken == null || webhookToken.isBlank()) {
            throw new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND, "Webhook không tồn tại.");
        }
        WorkflowWebhookRow webhook = webhooks.findByToken(webhookToken.trim())
                .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND, "Webhook không tồn tại hoặc đã đổi mã."));
        if (!webhook.isEnabled()) {
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Webhook của luồng này đang tắt.");
        }
        if (payload == null || payload.isNull() || (payload.isObject() && payload.isEmpty())) {
            throw new ValidationException("Body JSON gửi vào Webhook không được để trống.");
        }

        UUID workspaceId = webhook.getWorkspaceId();
        String workflowId = webhook.getWorkflowId();
        String rawJson = toJsonString(payload);
        Instant now = clock.instant();

        TransactionTemplate requiresNew = new TransactionTemplate(transactionManager);
        requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        requiresNew.executeWithoutResult(status -> webhooks.recordPayload(workspaceId, workflowId, rawJson, now));

        return new TransactionTemplate(transactionManager).execute(status -> {
            requireRunnableWorkflow(workspaceId, workflowId);
            TenantWorkflowRow row = workflows.findWorkflow(workspaceId, workflowId)
                    .orElseThrow(() -> new ApplicationException(ErrorCode.RESOURCE_NOT_FOUND));
            JsonNode definition = parseJson(row.getDefinitionJson());
            Optional<SheetWriteTargetPlan> maybePlan = extractWebhookAppendPlan(definition);

            if (maybePlan.isEmpty()) {
                return WebhookIngressResponse.builder()
                        .status("PAYLOAD_CAPTURED")
                        .message("Đã lưu dữ liệu mẫu từ Webhook. Hãy nối khối Webhook -> Ghi về bảng tính để tự động thêm dòng.")
                        .rowsAppended(0)
                        .cellsWritten(0)
                        .appendedKeys(List.of())
                        .build();
            }

            SheetWriteTargetPlan targetPlan = maybePlan.get();
            ParsedPayload parsed = extractPayloadRows(payload);
            String accessToken = resolveGoogleAccessTokenForWebhook(workspaceId, workflowId, targetPlan.getNodeId());

            String fingerprint = "webhook-append:" + targetPlan.getTargetSpreadSheetId() + ":" + targetPlan.getTargetSheetName();
            String contextId = FlowContextIds.scoped(workspaceId, workflowId, fingerprint);
            contexts.ensure(workspaceId, workflowId, fingerprint, contextId);

            RunSyncResponse syncResult = syncExecutionService.executeWebhookAppend(
                    workspaceId,
                    workflowId,
                    contextId,
                    accessToken,
                    targetPlan,
                    parsed.rows(),
                    parsed.headers()
            );

            return WebhookIngressResponse.builder()
                    .status(syncResult.getStatus())
                    .message("Đã thêm " + syncResult.getTargetRowsUpdated() + " dòng học viên mới vào bảng tính.")
                    .executionId(syncResult.getExecutionId())
                    .rowsAppended(syncResult.getTargetRowsUpdated())
                    .cellsWritten(syncResult.getTargetCellsUpdated())
                    .appendedKeys(syncResult.getCleanRecordIds())
                    .build();
        });
    }

    private void requireRunnableWorkflow(UUID workspaceId, String workflowId) {
        TenantWorkflowDiagnostic diagnostic = workflows.findRunDiagnostic(workspaceId, workflowId).orElse(null);
        if (diagnostic == null || !diagnostic.workflowEnabled() || !diagnostic.moduleEnabled()) {
            throw new ApplicationException(ErrorCode.STATE_CONFLICT, "Module hoặc workflow đang tắt. Vui lòng bật lại trước khi gửi Webhook.");
        }
    }

    private Optional<SheetWriteTargetPlan> extractWebhookAppendPlan(JsonNode definition) {
        JsonNode nodes = definition.path("nodes");
        JsonNode edges = definition.path("edges");
        if (!nodes.isArray() || !edges.isArray()) return Optional.empty();

        String webhookNodeId = null;
        JsonNode sheetWriteNode = null;
        for (JsonNode n : nodes) {
            String type = n.path("type").asText("");
            if ("webhookTrigger".equals(type) && webhookNodeId == null) {
                webhookNodeId = n.path("id").asText("");
            } else if ("sheetWriteAction".equals(type) && sheetWriteNode == null) {
                sheetWriteNode = n;
            }
        }
        if (webhookNodeId == null || sheetWriteNode == null) return Optional.empty();

        String swId = sheetWriteNode.path("id").asText("");
        boolean connected = false;
        for (JsonNode e : edges) {
            if (webhookNodeId.equals(e.path("source").asText(""))
                    && swId.equals(e.path("target").asText(""))) {
                connected = true;
                break;
            }
        }
        if (!connected) return Optional.empty();

        JsonNode data = sheetWriteNode.path("data");
        String targetSpreadsheetId = data.path("targetSpreadsheetId").asText(data.path("spreadsheetId").asText("")).trim();
        String targetSheetName = data.path("targetSheetName").asText(data.path("sheetName").asText("")).trim();
        String sourceKey = data.path("sourceKeyColumn").asText("").trim();
        String targetKey = data.path("targetKeyColumn").asText("").trim();

        List<SheetWritePreviewRequest.ColumnMappingItem> mappings = new ArrayList<>();
        JsonNode mappingsNode = data.path("columnMappings");
        if (mappingsNode.isArray()) {
            for (JsonNode m : mappingsNode) {
                String src = m.path("sourceColumn").asText("").trim();
                String tgt = m.path("targetColumn").asText("").trim();
                if (!src.isBlank() && !tgt.isBlank()) {
                    mappings.add(new SheetWritePreviewRequest.ColumnMappingItem(src, tgt));
                }
            }
        }
        if (targetSpreadsheetId.isBlank() || targetSheetName.isBlank() || sourceKey.isBlank() || targetKey.isBlank()) {
            throw new ValidationException("Khối Ghi về bảng tính chưa được cấu hình đầy đủ (file đích, tab đích, khóa học viên).");
        }
        return Optional.of(SheetWriteTargetPlan.builder()
                .nodeId(swId)
                .targetSpreadSheetId(targetSpreadsheetId)
                .targetSheetName(targetSheetName)
                .sourceKeyColumn(sourceKey)
                .targetKeyColumn(targetKey)
                .columnMappings(mappings)
                .build());
    }

    private String resolveGoogleAccessToken(UUID workspaceId, String workflowId) {
        return resolveGoogleAccessTokenForWebhook(workspaceId, workflowId, null);
    }

    private String resolveGoogleAccessTokenForWebhook(UUID workspaceId, String workflowId, String preferredNodeId) {
        List<ConnectionBindingItem> bindings = workflows.findBindings(workspaceId, workflowId);
        String googleId = null;
        if (preferredNodeId != null) {
            for (ConnectionBindingItem b : bindings) {
                if (preferredNodeId.equals(b.getNodeId())) {
                    googleId = connections.findGoogleConnectionId(workspaceId, b.getConnectionId()).orElse(null);
                    if (googleId != null) break;
                }
            }
        }
        if (googleId == null) {
            for (ConnectionBindingItem b : bindings) {
                Optional<String> candidate = connections.findGoogleConnectionId(workspaceId, b.getConnectionId());
                if (candidate.isPresent()) {
                    googleId = candidate.get();
                    break;
                }
            }
        }
        if (googleId == null) {
            throw new ApplicationException(ErrorCode.CONNECTION_REQUIRED, "Chưa chọn kết nối Google đang hoạt động cho khối Ghi về bảng tính.");
        }
        return credentials.resolveAccessToken(googleId);
    }

    private record ParsedPayload(List<String> headers, List<Map<String, String>> rows) {}

    private ParsedPayload extractPayloadRows(JsonNode payload) {
        List<JsonNode> items = new ArrayList<>();
        if (payload.isArray()) {
            payload.forEach(items::add);
        } else if (payload.isObject() && payload.get("rows") != null && payload.get("rows").isArray()) {
            payload.get("rows").forEach(items::add);
        } else if (payload.isObject()) {
            items.add(payload);
        }
        if (items.isEmpty()) {
            throw new ValidationException("Không tìm thấy bản ghi học viên nào trong payload Webhook.");
        }
        Set<String> headers = new LinkedHashSet<>();
        List<Map<String, String>> rows = new ArrayList<>();
        for (JsonNode item : items) {
            if (!item.isObject()) {
                throw new ValidationException("Mỗi bản ghi học viên trong Webhook phải là một đối tượng JSON.");
            }
            Map<String, String> flat = new LinkedHashMap<>();
            flattenJson("", item, flat);
            headers.addAll(flat.keySet());
            rows.add(flat);
        }
        return new ParsedPayload(new ArrayList<>(headers), rows);
    }

    private void flattenJson(String prefix, JsonNode node, Map<String, String> out) {
        if (node == null || node.isNull()) return;
        if (node.isObject()) {
            node.fields().forEachRemaining(entry -> {
                String key = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
                JsonNode val = entry.getValue();
                if (val != null && val.isObject()) {
                    flattenJson(key, val, out);
                } else if (val != null && !val.isArray()) {
                    out.put(key, val.isNull() ? "" : val.asText(""));
                }
            });
        }
    }

    private WorkflowWebhookResponse toResponse(WorkflowWebhookRow row) {
        JsonNode parsed = null;
        List<String> sampleFields = List.of();
        if (row.getLastPayloadJson() != null && !row.getLastPayloadJson().isBlank()) {
            try {
                parsed = mapper.readTree(row.getLastPayloadJson());
                ParsedPayload extracted = extractPayloadRows(parsed);
                sampleFields = extracted.headers();
            } catch (Exception ignored) {
            }
        }
        return WorkflowWebhookResponse.builder()
                .webhookToken(row.getWebhookToken())
                .webhookPath("/api/v1/webhooks/" + row.getWebhookToken())
                .enabled(row.isEnabled())
                .lastPayload(parsed)
                .sampleFields(sampleFields)
                .lastReceivedAt(row.getLastReceivedAt())
                .build();
    }

    private JsonNode parseJson(String json) {
        try {
            return mapper.readTree(json);
        } catch (JsonProcessingException e) {
            throw new ValidationException("Dữ liệu JSON không hợp lệ.");
        }
    }

    private String toJsonString(JsonNode node) {
        try {
            return mapper.writeValueAsString(node);
        } catch (JsonProcessingException e) {
            throw new ValidationException("Không thể mã hóa JSON.");
        }
    }

    private String generateToken() {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }
}
