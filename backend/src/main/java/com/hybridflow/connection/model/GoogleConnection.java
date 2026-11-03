package com.hybridflow.connection.model;

import lombok.*;
import java.time.Instant;

@Getter @AllArgsConstructor
public class GoogleConnection {
    private final String id;
    private final String accessToken;
    private final String refreshToken;
    private final Instant expiresAt;
    private final String state;
}
