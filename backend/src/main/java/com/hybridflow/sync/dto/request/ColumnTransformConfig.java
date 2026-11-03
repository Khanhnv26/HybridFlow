package com.hybridflow.sync.dto.request;

import lombok.*;
import java.util.List;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder @EqualsAndHashCode
public class ColumnTransformConfig {
    private String columnName;
    private List<String> rules;
    private String defaultValue;
}
