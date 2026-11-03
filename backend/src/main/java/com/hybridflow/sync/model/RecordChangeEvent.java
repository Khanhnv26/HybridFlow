package com.hybridflow.sync.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Map;
import java.util.Set;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RecordChangeEvent {
    private String recordId;
    private String kind;
    private Long revision;
    private Map<String, String> before;
    private Map<String, String> after;
    private Set<String> changedColumns;
    private Set<String> conflictedColumns;
}
