package com.hybridflow.sync.dto.response;

import lombok.*;

@Setter
@Getter
@NoArgsConstructor
@AllArgsConstructor
@ToString
@Builder
public class FieldConflict {
    private String column;
    private String baseValue;
    private String valueA;
    private String valueB;
}
