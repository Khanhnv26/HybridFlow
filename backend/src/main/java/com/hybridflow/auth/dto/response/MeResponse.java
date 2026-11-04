package com.hybridflow.auth.dto.response;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.UUID;

@AllArgsConstructor
@Getter
public class MeResponse {
    private final UUID id;
    private final String email;
    private final String displayName;

}
