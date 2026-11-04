package com.hybridflow.auth.dto.response;


import lombok.*;

import java.util.UUID;

@AllArgsConstructor
@Getter
public class MeResponse {
    private final UUID ID;
    private final String email;
    private final String displayName;
}
