package com.hybridflow.sync.service;

import com.hybridflow.sync.dto.request.ColumnTransformConfig;
import java.util.List;
import java.util.Map;

public interface DataTransformerService {
    Map<String, String> transformRow(Map<String, String> row, List<ColumnTransformConfig> configs);
    List<Map<String, String>> transformRows(List<Map<String, String>> rows, List<ColumnTransformConfig> configs);
}
