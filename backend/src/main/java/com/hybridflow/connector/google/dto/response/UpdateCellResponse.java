package com.hybridflow.connector.google.dto.response;

import lombok.*;

@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
@Builder
public class UpdateCellResponse {
    private String range;
    private String updatedValue;
    private boolean success;
    private String message;
}
