package com.hybridflow.sync.support;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.sync.dto.request.SheetEndpointRequest;
import com.hybridflow.sync.model.SheetWritePlan;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class SyncJsonCodec {
    private final ObjectMapper mapper;

    public String encode(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (JsonProcessingException exception) {
            throw new ApplicationException(ErrorCode.INTERNAL_ERROR, "Không thể mã hóa dữ liệu.", exception);
        }
    }

    public Map<String, String> decodeRow(String value) {
        try {
            return mapper.readValue(value, new TypeReference<Map<String, String>>() {});
        } catch (JsonProcessingException exception) {
            throw new ApplicationException(ErrorCode.INTERNAL_ERROR, "Dữ liệu snapshot không hợp lệ.", exception);
        }
    }

    public List<String> decodeColumns(String value) {
        try {
            return mapper.readValue(value, new TypeReference<List<String>>() {});
        } catch (JsonProcessingException exception) {
            throw new ApplicationException(ErrorCode.INTERNAL_ERROR, "Cấu trúc cột lưu không hợp lệ.", exception);
        }
    }

    public List<SheetEndpointRequest> decodeEndpoints(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }

        try {
            return mapper.readValue(value, new TypeReference<List<SheetEndpointRequest>>() {
            });
        } catch (JsonProcessingException exception) {
            throw new ApplicationException(ErrorCode.INTERNAL_ERROR, "Danh sách Sheet lưu không hợp lệ.", exception);
        }
    }

    public List<SheetWritePlan> decodeWritePlans(String value) {
        try {
            return mapper.readValue(value, new TypeReference<List<SheetWritePlan>>() {});
        } catch (JsonProcessingException exception) {
            throw new ApplicationException(ErrorCode.INTERNAL_ERROR, "Nhật ký ghi Sheet không hợp lệ.", exception);
        }
    }

    public Map<String, String> decodeCandidates(String value) {
        if (value == null || value.isBlank()) {
            return Map.of();
        }
        try {
            return mapper.readValue(value, new TypeReference<LinkedHashMap<String, String>>() {});
        } catch (JsonProcessingException exception) {
            throw new ApplicationException(ErrorCode.INTERNAL_ERROR, "Danh sách giá trị xung đột không hợp lệ.", exception);
        }
    }
}
