package com.hybridflow.sync.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;

public final class FlowContextIds {
    private FlowContextIds() {}

    public static String scoped(UUID workspaceId, String workflowId, String fingerprint) {
        String source = workspaceId + "\n" + workflowId + "\n" + fingerprint;
        try {
            return "flow-" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(source.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
