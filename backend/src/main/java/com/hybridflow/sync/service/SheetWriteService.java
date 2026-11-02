package com.hybridflow.sync.service;
import com.hybridflow.sync.model.SheetWritePlan;
import java.util.List;
public interface SheetWriteService {
    void recover(String accessToken, List<String> spreadsheetIds);
    void apply(String accessToken, List<SheetWritePlan> plans);
}
