package com.hybridflow.common.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class FieldViolation {
    private final String field;
    private final String message;
}
