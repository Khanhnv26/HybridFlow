package com.hybridflow.sync.engine;

import com.hybridflow.sync.model.SyncDiffResult;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Component
public class ThreeWayDiffEngine {

    public SyncDiffResult compareRow(
            String recordId,
            Map<String, String> baseRow,
            Map<String, String> rowSheetA,
            Map<String, String> rowSheetB,
            Set<String> columns
    ) {
        SyncDiffResult result = new SyncDiffResult(recordId);
        for (String col : columns) {

            String baseValue = baseRow != null ? baseRow.get(col) : null;
            String valueA = rowSheetA != null ? rowSheetA.get(col) : null;
            String valueB = rowSheetB != null ? rowSheetB.get(col) : null;

            boolean aChanged = !Objects.equals(baseValue, valueA);
            boolean bChanged = !Objects.equals(baseValue, valueB);

            if(aChanged && bChanged) {

                if(!Objects.equals(valueA, valueB)) {
                    result.addConflict(col, baseValue, valueA, valueB);
                }

            } else if(aChanged) {
                result.addUpdateForB(col, valueA);
            } else if(bChanged) {
                result.addUpdateForA(col, valueB);
            }
        }

        return result;
    }
}
