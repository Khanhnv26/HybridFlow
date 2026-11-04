package com.hybridflow.connection.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.connection.view.GoogleOAuthCallbackRenderer;
import com.hybridflow.common.dto.ErrorDetails;
import com.hybridflow.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WorkspaceOAuthCallbackRendererTest {
    @Test void successAndFailureUseWorkspaceMessagesAndEscapeScriptContent() {
        GoogleOAuthCallbackRenderer renderer = new GoogleOAuthCallbackRenderer(new ObjectMapper());
        String success = renderer.renderWorkspace("gconn-test", null, "http://localhost:3000");
        assertTrue(success.contains("WORKSPACE_GOOGLE_CONNECTED"));
        assertTrue(success.contains("gconn-test"));
        assertFalse(success.contains("accessToken"));
        String failure = renderer.renderWorkspace(null,
                new ErrorDetails(ErrorCode.OAUTH_CANCELLED, "</script><script>unsafe</script>", "trace", 0), "http://localhost:3000");
        assertTrue(failure.contains("WORKSPACE_GOOGLE_ERROR"));
        assertFalse(failure.contains("</script><script>unsafe"));
        assertFalse(failure.contains("{{"));
    }
}
