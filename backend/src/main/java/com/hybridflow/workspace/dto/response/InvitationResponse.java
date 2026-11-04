package com.hybridflow.workspace.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.Instant;
import java.util.UUID;

@Getter
@AllArgsConstructor
public class InvitationResponse {
    private final UUID id;
    private final String invitationUrl;
    private final Instant expiresAt;
}
