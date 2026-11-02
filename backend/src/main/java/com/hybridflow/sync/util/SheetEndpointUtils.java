package com.hybridflow.sync.util;
import com.hybridflow.sync.dto.request.SheetEndpointRequest;
public final class SheetEndpointUtils {
    private SheetEndpointUtils() {}
    public static String identity(SheetEndpointRequest endpoint) {
        return endpoint.getSpreadsheetId().length() + ":" + endpoint.getSpreadsheetId() + endpoint.getSheetName();
    }
}
