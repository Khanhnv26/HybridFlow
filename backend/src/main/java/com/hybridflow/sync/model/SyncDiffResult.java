package com.hybridflow.sync.model;

import com.hybridflow.sync.dto.response.FieldConflict;
import lombok.Getter;
import lombok.RequiredArgsConstructor;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Getter
@RequiredArgsConstructor
public class SyncDiffResult {
    private final String recordId;
    private final Map<String, String> updatesForB = new HashMap<>();
    private final Map<String, String> updatesForA = new HashMap<>();
    private final List<FieldConflict> conflicts = new ArrayList<>();

    public void addUpdateForB(String column, String value) {
        this.updatesForB.put(column, value);
    }

    public void addUpdateForA(String column, String value) {
        this.updatesForA.put(column, value);
    }

    public void addConflict(String column, String baseValue, String valueA, String valueB) {
        FieldConflict conflict = FieldConflict.builder()
                .column(column)
                .baseValue(baseValue)
                .valueA(valueA)
                .valueB(valueB)
                .build();
        this.conflicts.add(conflict);
    }

    public boolean hasConflicts() {
        return !this.conflicts.isEmpty();
    }
}
