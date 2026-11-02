package com.hybridflow.connector.google.dto.request;


import lombok.*;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class UpdateCellRequest {
    private String accessToken;
    private String spreadsheetId;
    private String range;
    private String value;
}
