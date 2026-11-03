package com.hybridflow.common.util;

import com.hybridflow.common.exception.ApplicationException;
import com.hybridflow.common.exception.ErrorCode;
import com.hybridflow.connection.exception.GoogleReconnectRequiredException;

public final class ExternalErrors {
    private ExternalErrors() {}

    public static ApplicationException google(int status, int retryAfterSeconds) {
        if (status == 401) return new GoogleReconnectRequiredException();
        ErrorCode code = switch (status) {
            case 400 -> ErrorCode.UPSTREAM_REJECTED;
            case 403 -> ErrorCode.ACCESS_DENIED;
            case 404 -> ErrorCode.RESOURCE_NOT_FOUND;
            case 429 -> ErrorCode.RATE_LIMITED;
            default -> status >= 500 ? ErrorCode.UPSTREAM_UNAVAILABLE : ErrorCode.UPSTREAM_FAILURE;
        };
        String message = switch (status) {
            case 400 -> "Google từ chối yêu cầu. Kiểm tra file, trang tính và phạm vi dữ liệu.";
            case 403 -> "Tài khoản Google chưa có quyền truy cập file. Kiểm tra quyền chia sẻ hoặc kết nối tài khoản khác.";
            case 404 -> "Không tìm thấy file Google Sheets hoặc tài khoản chưa có quyền truy cập.";
            case 429 -> "Google đang giới hạn tần suất. Vui lòng thử lại sau.";
            default -> "Google chưa xử lý được yêu cầu. Vui lòng thử lại sau.";
        };
        return new ApplicationException(code, message, null, retryAfterSeconds);
    }

    public static ApplicationException telegram(int status, boolean chatNotFound, int retryAfterSeconds) {
        ErrorCode code = switch (status) {
            case 400 -> ErrorCode.UPSTREAM_REJECTED;
            case 401 -> ErrorCode.CONFIGURATION_ERROR;
            case 403 -> ErrorCode.ACCESS_DENIED;
            case 409 -> ErrorCode.STATE_CONFLICT;
            case 429 -> ErrorCode.RATE_LIMITED;
            default -> ErrorCode.UPSTREAM_UNAVAILABLE;
        };
        String message = switch (status) {
            case 401 -> "Bot Telegram chưa sẵn sàng. Liên hệ quản trị viên để kiểm tra kết nối bot.";
            case 403 -> "Bot chưa được phép gửi tin. Mở bot và bấm Start, hoặc thêm bot vào nhóm và cho phép gửi tin nhắn.";
            case 409 -> "Bot đang được kết nối ở nơi khác. Dùng thiết lập nâng cao hoặc liên hệ quản trị viên.";
            case 429 -> "Telegram đang giới hạn tần suất. Vui lòng thử lại sau.";
            case 400 -> chatNotFound
                    ? "Không tìm thấy nơi nhận. Mở bot và bấm Start, hoặc thêm bot vào nhóm rồi kết nối lại."
                    : "Telegram chưa chấp nhận nơi nhận này. Kiểm tra bot đã có trong cuộc trò chuyện và được phép gửi tin.";
            default -> "Chưa kết nối được Telegram. Vui lòng thử lại sau.";
        };
        return new ApplicationException(code, message, null, status == 429 ? Math.min(86400, Math.max(1, retryAfterSeconds)) : 0);
    }
}
