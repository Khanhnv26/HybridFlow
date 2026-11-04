package com.hybridflow.workspace.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class InvitationTokensTest {
    @Test
    void generatedTokenIs43CharsUrlSafe() {
        String token1 = InvitationTokens.create();
        String token2 = InvitationTokens.create();

        assertNotNull(token1);
        assertEquals(43, token1.length());
        assertNotEquals(token1, token2);
    }

    @Test
    void hashIsDeterministicSha256Hex() {
        String token = InvitationTokens.create();
        String hash1 = InvitationTokens.hash(token);
        String hash2 = InvitationTokens.hash(token);

        assertEquals(64, hash1.length());
        assertEquals(hash1, hash2);
    }
}
