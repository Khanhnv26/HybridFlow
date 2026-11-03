package com.hybridflow.connection.exception;

import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;

public class GoogleReconnectRequiredException extends ApplicationException {
    public GoogleReconnectRequiredException() { super(ErrorCode.CONNECTION_REQUIRED, "Cần kết nối lại Google để tiếp tục đồng bộ."); }
}
