package com.hybridflow.connection.exception;

public class GoogleReconnectRequiredException extends IllegalArgumentException {
    public GoogleReconnectRequiredException() { super("Cần kết nối lại Google để tiếp tục đồng bộ."); }
}
