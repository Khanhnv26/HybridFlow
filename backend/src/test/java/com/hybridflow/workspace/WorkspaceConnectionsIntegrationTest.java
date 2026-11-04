package com.hybridflow.workspace;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.api.client.googleapis.auth.oauth2.GoogleTokenResponse;
import com.hybridflow.connection.service.GoogleOAuthService;
import com.hybridflow.connector.google.service.GoogleSheetsService;
import com.hybridflow.notification.client.TelegramApiClient;
import com.hybridflow.sync.dto.request.RunSyncRequest;
import com.hybridflow.sync.dto.response.RunSyncResponse;
import com.hybridflow.sync.service.SyncExecutionService;
import com.hybridflow.workspace.service.GoogleConnectionRegistrationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import java.util.Map;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@EnabledIfEnvironmentVariable(named = "HYBRIDFLOW_TEST_DB_URL", matches = "jdbc:postgresql://(localhost|127[.]0[.]0[.]1):15432/hybridflow_test")
@SpringBootTest(properties = {"spring.datasource.url=${HYBRIDFLOW_TEST_DB_URL}",
        "spring.datasource.username=hybridflow_test", "spring.datasource.password=hybridflow_test",
        "hybridflow.scheduler.enabled=false", "google.oauth.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.security.oauth2.client.registration.google.client-id=test-client",
        "spring.security.oauth2.client.registration.google.client-secret=test-secret"})
@AutoConfigureMockMvc
class WorkspaceConnectionsIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    @Autowired GoogleConnectionRegistrationService registration;
    @MockBean GoogleOAuthService oauth;
    @MockBean GoogleSheetsService sheets;
    @MockBean TelegramApiClient telegram;
    @MockBean SyncExecutionService execution;
    private UUID user;
    private UUID workspace;
    private String subject;
    private static final String CALLBACK = "http://localhost:8080/api/v1/workspaces/connections/google/callback";

    @BeforeEach void setup() throws Exception {
        user = UUID.randomUUID(); subject = "connections-" + user;
        jdbc.update("INSERT INTO app_users(id,google_subject,email,display_name) VALUES (?,?,?,?)", user, subject, "owner@example.test", "Owner");
        String created = mvc.perform(post("/api/v1/workspaces").with(oidcLogin().idToken(token -> token.subject(subject))).with(csrf())
                .contentType("application/json").content("{\"name\":\"Connections\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        workspace = UUID.fromString(mapper.readTree(created).path("id").asText());
    }

    private GoogleTokenResponse token() {
        return new GoogleTokenResponse().setAccessToken("test-access").setRefreshToken("test-refresh").setExpiresInSeconds(3600L);
    }

    private String bot(String secret, String name) throws Exception {
        when(telegram.callWithToken(secret, "getMe", null)).thenReturn(mapper.readTree("{\"username\":\"" + name + "\"}"));
        String response = mvc.perform(post("/api/v1/workspaces/" + workspace + "/connections/telegram")
                .with(oidcLogin().idToken(token -> token.subject(subject))).with(csrf()).contentType("application/json")
                .content(mapper.writeValueAsString(Map.of("name", name, "botToken", secret))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("id").asText();
    }

    @Test void googleCallbackRegistersConnectionWithMatchingRedirectAndConsumesState() throws Exception {
        MockHttpSession session = new MockHttpSession();
        when(oauth.buildAuthorizationUrl(anyString(), eq(CALLBACK))).thenAnswer(call -> "https://accounts.example/?state=" + call.getArgument(0));
        when(oauth.exChangeCode("code", CALLBACK)).thenReturn(token());
        mvc.perform(post("/api/v1/workspaces/" + workspace + "/connections/google/start").session(session)
                .with(oidcLogin().idToken(token -> token.subject(subject))).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.callbackOrigin").value("http://localhost:8080"));
        ArgumentCaptor<String> state = ArgumentCaptor.forClass(String.class);
        verify(oauth).buildAuthorizationUrl(state.capture(), eq(CALLBACK));
        String html = mvc.perform(get("/api/v1/workspaces/connections/google/callback").session(session)
                .with(oidcLogin().idToken(token -> token.subject(subject))).param("code", "code").param("state", state.getValue()))
                .andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith("text/html"))
                .andReturn().getResponse().getContentAsString();
        assertTrue(html.contains("WORKSPACE_GOOGLE_CONNECTED"));
        assertFalse(html.contains("test-access"));
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM workspace_connections WHERE workspace_id=? AND provider='GOOGLE'", Integer.class, workspace));
        mvc.perform(get("/api/v1/workspaces/connections/google/callback").session(session)
                .with(oidcLogin().idToken(token -> token.subject(subject))).param("code", "code").param("state", state.getValue()))
                .andExpect(status().isConflict());
        verify(oauth, times(1)).exChangeCode("code", CALLBACK);
    }

    @Test void failedCatalogRegistrationRollsBackEncryptedCredential() {
        int before = jdbc.queryForObject("SELECT count(*) FROM google_connections", Integer.class);
        assertThrows(DataAccessException.class, () -> registration.register(workspace, user, "x".repeat(121), token()));
        assertEquals(before, jdbc.queryForObject("SELECT count(*) FROM google_connections", Integer.class));
    }

    @Test void viewerCannotWriteSheetAndForeignConnectionCannotBeUsed() throws Exception {
        String connection = registration.register(workspace, user, "Google", token()).getId();
        UUID viewer = UUID.randomUUID(); String viewerSubject = "viewer-" + viewer;
        jdbc.update("INSERT INTO app_users(id,google_subject,email,display_name) VALUES (?,?,?,?)", viewer, viewerSubject, "viewer@example.test", "Viewer");
        jdbc.update("INSERT INTO workspace_members(workspace_id,user_id,role) VALUES (?,?,'VIEWER')", workspace, viewer);
        String path = "/api/v1/workspaces/" + workspace + "/connections/" + connection + "/sheets/update";
        mvc.perform(post(path).with(oidcLogin().idToken(token -> token.subject(viewerSubject))).with(csrf())
                .contentType("application/json").content("{\"spreadsheetId\":\"file\",\"range\":\"Data!A1\",\"value\":\"x\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/workspaces/" + workspace + "/connections/foreign/sheets/metadata")
                .with(oidcLogin().idToken(token -> token.subject(subject))).param("spreadsheetId", "file"))
                .andExpect(status().isNotFound());
        verify(sheets, never()).updateCell(any());
        verify(sheets, never()).getMetadata(any());
    }

    @Test void telegramTestUsesSelectedEncryptedWorkspaceBot() throws Exception {
        bot("token-a", "BotA");
        String selected = bot("token-b", "BotB");
        when(telegram.callWithToken("token-b", "getChat", Map.of("chat_id", "123")))
                .thenReturn(mapper.readTree("{\"id\":123,\"type\":\"private\",\"first_name\":\"Recipient\"}"));
        when(telegram.callWithToken(eq("token-b"), eq("sendMessage"), anyMap())).thenReturn(mapper.readTree("{\"message_id\":1}"));
        mvc.perform(post("/api/v1/workspaces/" + workspace + "/connections/" + selected + "/telegram/test")
                .with(oidcLogin().idToken(token -> token.subject(subject))).with(csrf()).contentType("application/json")
                .content("{\"chatId\":\"123\",\"recipientType\":\"PRIVATE\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true));
        verify(telegram).callWithToken(eq("token-b"), eq("sendMessage"), anyMap());
        verify(telegram, never()).callWithToken(eq("token-a"), eq("sendMessage"), anyMap());
        verify(telegram, never()).call(any(), any());
    }

    @Test void manualRunUsesWorkspaceCredentialsAndCarriesSelectedBotIntoActionPlan() throws Exception {
        String google = registration.register(workspace, user, "Google", token()).getId();
        String bot = bot("workspace-bot", "AlertsBot");
        UUID module = UUID.randomUUID();
        jdbc.update("INSERT INTO business_modules(id,workspace_id,name) VALUES (?,?,?)", module, workspace, "Sales");
        String base = "/api/v1/workspaces/" + workspace + "/workflows";
        String created = mvc.perform(post(base).with(oidcLogin().idToken(token -> token.subject(subject))).with(csrf())
                .contentType("application/json").content(mapper.writeValueAsString(Map.of("name", "Flow", "moduleId", module))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String workflow = mapper.readTree(created).path("flowId").asText();
        JsonNode graph = mapper.readTree("""
                {"nodes":[{"id":"sheet","type":"sheetsTrigger","data":{"spreadsheetId":"file","sheetName":"Data"}},
                {"id":"diff","type":"diffEngine","data":{"uniqueKey":"id","conflictPolicy":"SOURCE_WINS"}},
                {"id":"vault","type":"storageAction","data":{"tableName":"vault"}},
                {"id":"telegram","type":"telegramAction","data":{"chatId":"123"}}],
                "edges":[{"source":"sheet","sourceHandle":"out","target":"diff","targetHandle":"in"},
                {"source":"diff","sourceHandle":"clean","target":"vault","targetHandle":"in"},
                {"source":"diff","sourceHandle":"conflict","target":"telegram","targetHandle":"in"}]}
                """);
        mvc.perform(put(base + "/" + workflow).with(oidcLogin().idToken(token -> token.subject(subject))).with(csrf())
                .contentType("application/json").content(mapper.writeValueAsString(Map.of("expectedVersion", 1, "enabled", true,
                        "definition", graph, "connectionBindings", java.util.List.of(Map.of("nodeId", "sheet", "connectionId", google),
                                Map.of("nodeId", "telegram", "connectionId", bot))))))
                .andExpect(status().isOk());
        when(execution.executeSync(any())).thenAnswer(call -> {
            RunSyncRequest plan = call.getArgument(0);
            return RunSyncResponse.builder().flowId(plan.getFlowId()).executionId(UUID.randomUUID().toString()).status("SUCCESS").build();
        });
        mvc.perform(post(base + "/" + workflow + "/run").param("bootstrapConfirmed", "true")
                .with(oidcLogin().idToken(token -> token.subject(subject))).with(csrf()))
                .andExpect(status().isOk());
        ArgumentCaptor<RunSyncRequest> plan = ArgumentCaptor.forClass(RunSyncRequest.class);
        verify(execution).executeSync(plan.capture());
        assertEquals(google, plan.getValue().getAccessToken());
        assertTrue(plan.getValue().isBootstrapConfirmed());
        assertEquals(workspace, plan.getValue().getActions().getFirst().getWorkspaceId());
        assertEquals(bot, plan.getValue().getActions().getFirst().getConnectionId());
        assertEquals(google, jdbc.queryForObject("SELECT google_connection_id FROM workflow_definitions WHERE flow_id=?", String.class, workflow));
    }
}
