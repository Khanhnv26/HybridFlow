package com.hybridflow.auth.dto.response;


import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class CsrfResponse {
    private final String headerName;
    private final String token;
}
