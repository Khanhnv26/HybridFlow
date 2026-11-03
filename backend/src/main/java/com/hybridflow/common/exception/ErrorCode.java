package com.hybridflow.common.exception;

import lombok.Getter;
import lombok.RequiredArgsConstructor;

@Getter
@RequiredArgsConstructor
public enum ErrorCode {
    INVALID_ARGUMENT(400, false, "Dữ liệu yêu cầu không hợp lệ."),
    MALFORMED_REQUEST(400, false, "Nội dung yêu cầu không đúng định dạng."),
    VALIDATION_FAILED(400, false, "Kiểm tra lại các trường dữ liệu."),
    RESOURCE_NOT_FOUND(404, false, "Không tìm thấy tài nguyên được yêu cầu."),
    ACCESS_DENIED(403, false, "Bạn chưa có quyền thực hiện thao tác này."),
    AUTHENTICATION_REQUIRED(401, false, "Cần đăng nhập để tiếp tục."),
    CONNECTION_REQUIRED(409, false, "Cần kết nối lại Google để tiếp tục."),
    OAUTH_CANCELLED(400, false, "Bạn chưa cấp quyền kết nối Google. Có thể mở kết nối lại khi cần."),
    STATE_CONFLICT(409, false, "Dữ liệu đã thay đổi. Tải lại và thử lại thao tác."),
    CONCURRENT_OPERATION(409, true, "Có thao tác đồng thời trên dữ liệu này. Vui lòng thử lại."),
    SYNC_RECOVERY_REQUIRED(409, false, "Có lần ghi chưa hoàn tất. Chạy lại luồng gốc để đối soát trước khi tiếp tục."),
    SYNC_VERIFY_FAILED(409, false, "Chưa xác minh được dữ liệu sau ghi. Chưa cập nhật checkpoint hoặc gửi thông báo."),
    METHOD_NOT_ALLOWED(405, false, "Phương thức HTTP không được hỗ trợ."),
    NOT_ACCEPTABLE(406, false, "Định dạng phản hồi được yêu cầu không được hỗ trợ."),
    UNSUPPORTED_MEDIA_TYPE(415, false, "Định dạng nội dung yêu cầu không được hỗ trợ."),
    PAYLOAD_TOO_LARGE(413, false, "Nội dung yêu cầu vượt kích thước cho phép."),
    RATE_LIMITED(429, true, "Dịch vụ đang giới hạn tần suất. Vui lòng thử lại sau."),
    UPSTREAM_REJECTED(422, false, "Dịch vụ ngoài từ chối yêu cầu. Kiểm tra cấu hình kết nối."),
    UPSTREAM_FAILURE(502, true, "Dịch vụ ngoài chưa trả về kết quả hợp lệ. Vui lòng thử lại."),
    UPSTREAM_UNAVAILABLE(503, true, "Chưa kết nối được dịch vụ ngoài. Vui lòng thử lại sau."),
    CONFIGURATION_ERROR(503, false, "Kết nối dịch vụ chưa được cấu hình. Liên hệ quản trị viên."),
    UPSTREAM_TIMEOUT(504, true, "Dịch vụ ngoài phản hồi quá chậm. Vui lòng thử lại."),
    INTERNAL_ERROR(500, false, "Hệ thống chưa hoàn tất thao tác. Vui lòng liên hệ quản trị viên kèm mã tra cứu.");

    private final int status;
    private final boolean retryable;
    private final String message;

    public static ErrorCode forHttpStatus(int status) {
        return switch (status) {
            case 400 -> MALFORMED_REQUEST;
            case 401 -> AUTHENTICATION_REQUIRED;
            case 403 -> ACCESS_DENIED;
            case 404 -> RESOURCE_NOT_FOUND;
            case 405 -> METHOD_NOT_ALLOWED;
            case 406 -> NOT_ACCEPTABLE;
            case 409 -> STATE_CONFLICT;
            case 413 -> PAYLOAD_TOO_LARGE;
            case 415 -> UNSUPPORTED_MEDIA_TYPE;
            case 422 -> UPSTREAM_REJECTED;
            case 429 -> RATE_LIMITED;
            case 502 -> UPSTREAM_FAILURE;
            case 503 -> UPSTREAM_UNAVAILABLE;
            case 504 -> UPSTREAM_TIMEOUT;
            default -> INTERNAL_ERROR;
        };
    }
}
