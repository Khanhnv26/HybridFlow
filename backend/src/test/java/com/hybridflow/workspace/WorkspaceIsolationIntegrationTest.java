package com.hybridflow.workspace;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;
import java.util.List;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@EnabledIfEnvironmentVariable(named="HYBRIDFLOW_TEST_DB_URL",
        matches="jdbc:postgresql://(localhost|127[.]0[.]0[.]1):15432/hybridflow_test")
@SpringBootTest(properties={
        "spring.datasource.url=${HYBRIDFLOW_TEST_DB_URL}",
        "spring.datasource.username=hybridflow_test",
        "spring.datasource.password=hybridflow_test",
        "hybridflow.scheduler.enabled=false",
        "spring.security.oauth2.client.registration.google.client-id=test-client",
        "spring.security.oauth2.client.registration.google.client-secret=test-secret",
        "google.oauth.encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="})
@AutoConfigureMockMvc
class WorkspaceIsolationIntegrationTest {
    @Autowired
    private MockMvc mvc;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private ObjectMapper mapper;

    private String subjectA;
    private String subjectB;

    @BeforeEach
    void accounts() {
        subjectA = "test-a-" + UUID.randomUUID();
        subjectB = "test-b-" + UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id,google_subject,email,display_name) VALUES (?,?,?,?)",
                UUID.randomUUID(), subjectA, "a@example.test", "A");
        jdbc.update("INSERT INTO app_users(id,google_subject,email,display_name) VALUES (?,?,?,?)",
                UUID.randomUUID(), subjectB, "b@example.test", "B");
    }

    @Test
    void anonymousCannotListWorkspaces() throws Exception {
        mvc.perform(get("/api/v1/workspaces")).andExpect(status().isUnauthorized());
    }

    @Test
    void modifyingWithoutCsrfIsRejected() throws Exception {
        mvc.perform(post("/api/v1/workspaces")
                .with(oidcLogin().idToken(token -> token.subject(subjectA)))
                .contentType("application/json").content("{\"name\":\"Shop A\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void anotherUserCannotCreateModuleInOwnersWorkspace() throws Exception {
        String created = mvc.perform(post("/api/v1/workspaces")
                .with(oidcLogin().idToken(token -> token.subject(subjectA))).with(csrf())
                .contentType("application/json").content("{\"name\":\"Shop A\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        JsonNode workspace = mapper.readTree(created);
        mvc.perform(post("/api/v1/workspaces/" + workspace.path("id").asText() + "/modules")
                .with(oidcLogin().idToken(token -> token.subject(subjectB))).with(csrf())
                .contentType("application/json")
                .content("{\"name\":\"Kho\",\"description\":\"\",\"enabled\":true}"))
                .andExpect(status().isForbidden());
    }

    private UUID workspace(String subject) throws Exception {
        String response = mvc.perform(post("/api/v1/workspaces")
                .with(oidcLogin().idToken(token -> token.subject(subject))).with(csrf())
                .contentType("application/json").content("{\"name\":\"Isolation test\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(mapper.readTree(response).path("id").asText());
    }

    @Test
    void workflowCreateReadUpdateAndListUseMigratedColumns() throws Exception {
        UUID workspace = workspace(subjectA);
        UUID module = UUID.randomUUID();
        jdbc.update("INSERT INTO business_modules(id,workspace_id,name) VALUES (?,?,?)", module, workspace, "Sales");
        String response = mvc.perform(post("/api/v1/workspaces/" + workspace + "/workflows")
                .with(oidcLogin().idToken(token -> token.subject(subjectA))).with(csrf())
                .contentType("application/json").content("{\"name\":\"First\",\"moduleId\":\"" + module + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String workflow = mapper.readTree(response).path("flowId").asText();
        String base = "/api/v1/workspaces/" + workspace + "/workflows";
        mvc.perform(get(base + "/" + workflow).with(oidcLogin().idToken(token -> token.subject(subjectA))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.definitionVersion").value(1));
        mvc.perform(put(base + "/" + workflow).with(oidcLogin().idToken(token -> token.subject(subjectA))).with(csrf())
                .contentType("application/json")
                .content("{\"expectedVersion\":1,\"name\":\"Renamed\",\"definition\":{\"nodes\":[],\"edges\":[]}}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Renamed"))
                .andExpect(jsonPath("$.definitionVersion").value(2));
        mvc.perform(get(base).with(oidcLogin().idToken(token -> token.subject(subjectA))))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("Renamed"));
        mvc.perform(get(base + "/" + workflow).with(oidcLogin().idToken(token -> token.subject(subjectB))))
                .andExpect(status().isForbidden());
    }

    @Test
    void legacyResourceEndpointsCannotBypassWorkspacePermissions() throws Exception {
        UUID workspace = workspace(subjectB);
        UUID module = UUID.randomUUID();
        String workflow = UUID.randomUUID().toString();
        String context = "flow-" + UUID.randomUUID();
        String execution = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO business_modules(id,workspace_id,name) VALUES (?,?,?)", module, workspace, "Private");
        jdbc.update("INSERT INTO workflow_definitions(flow_id,workspace_id,module_id,definition) VALUES (?,?,?,'{}'::jsonb)", workflow, workspace, module);
        jdbc.update("INSERT INTO flow_contexts(flow_id,workspace_id,workflow_id,config_fingerprint) VALUES (?,?,?,?)", context, workspace, workflow, "test");
        jdbc.update("INSERT INTO sync_executions(id,flow_id,status) VALUES (?,?,'SUCCESS')", execution, context);
        mvc.perform(get("/api/v1/workspaces/" + workspace + "/workflows/" + workflow + "/history")
                .with(oidcLogin().idToken(token -> token.subject(subjectA)))).andExpect(status().isForbidden());
        for (String endpoint : List.of(
                "GET /api/v1/workflows/" + context + "/history",
                "DELETE /api/v1/workflows/" + context + "/history",
                "GET /api/v1/workflows/" + context + "/vault",
                "GET /api/v1/workflows/" + context + "/notifications",
                "PUT /api/v1/workflows/" + workflow + "/definition",
                "POST /api/v1/workflows/" + workflow + "/run",
                "POST /api/v1/notifications/missing/retry",
                "GET /api/v1/conflicts?flowId=" + context,
                "GET /api/v1/sync-conflicts?flowId=" + context,
                "POST /api/v1/conflicts/1/resolve",
                "POST /api/v1/sync/run")) {
            String[] parts = endpoint.split(" ", 2);
            mvc.perform(request(org.springframework.http.HttpMethod.valueOf(parts[0]), parts[1])
                    .with(oidcLogin().idToken(token -> token.subject(subjectA))).with(csrf())
                    .contentType("application/json").content("{}"))
                    .andExpect(status().isForbidden());
        }
        String base = "/api/v1/workspaces/" + workspace + "/workflows/" + workflow;
        mvc.perform(get(base + "/history").with(oidcLogin().idToken(token -> token.subject(subjectB))))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(execution));
        mvc.perform(get(base + "/conflicts").with(oidcLogin().idToken(token -> token.subject(subjectB))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get(base + "/contexts/" + context + "/vault").with(oidcLogin().idToken(token -> token.subject(subjectB))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get(base + "/schedule").with(oidcLogin().idToken(token -> token.subject(subjectB))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));
    }
}
