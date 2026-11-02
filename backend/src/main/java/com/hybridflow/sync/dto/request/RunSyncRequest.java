package com.hybridflow.sync.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Set;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RunSyncRequest {
    private String flowId;
    private String accessToken;
    private String spreadsheetId;
    private String sheetName;
    @Builder.Default
    private String idColumn = "id";
    private Set<String> syncColumns;
}