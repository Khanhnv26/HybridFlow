# Hợp đồng xử lý lỗi HybridFlow

Backend API, worker đồng bộ và outbox dùng chung `ErrorCode` và `ErrorClassifier`. Frontend đọc lỗi qua `services/errors.ts`. Không phân loại lỗi bằng cách tìm từ khóa trong thông báo tiếng Việt.

## HTTP API

Phản hồi lỗi JSON giữ các trường cũ `timestamp`, `status`, `error`, `message` và bổ sung `code`, `correlationId`, `path`, `retryable`, `retryAfterSeconds`, `fieldErrors`. Thời gian là UTC ISO-8601. `path` không chứa query string. Mã lỗi dùng cho logic; `message` dùng cho người dùng.

Ví dụ khi bị giới hạn tần suất:

```json
{
  "timestamp": "2026-11-03T12:00:00Z",
  "status": 429,
  "error": "Too Many Requests",
  "code": "RATE_LIMITED",
  "message": "Google đang giới hạn tần suất. Vui lòng thử lại sau.",
  "correlationId": "ad97a658-4ab2-4a33-b176-8310219b04bd",
  "path": "/api/v1/sync/run",
  "retryable": true,
  "retryAfterSeconds": 17,
  "fieldErrors": []
}
```

Header `X-Correlation-ID` trùng với mã tra cứu trong body. Chỉ tái sử dụng header đầu vào có định dạng UUID; giá trị khác được thay bằng UUID mới. Có `Retry-After` khi biết thời gian chờ. Các header giao thức như `Allow` được giữ lại. CORS cho frontend đọc hai header này.

- 400: đầu vào không hợp lệ, JSON sai, thiếu tham số hoặc lỗi binding. `ValidationException` giữ thông báo do ứng dụng chủ động viết; `IllegalArgumentException` chưa phân loại chỉ trả thông báo chung.
- 401/403: cần đăng nhập hoặc chưa có quyền. Google/Telegram từ chối quyền được phân biệt với dữ liệu form sai.
- 404: không tìm thấy tài nguyên hoặc đường dẫn.
- 405/406/415: method, kiểu phản hồi hoặc kiểu nội dung không được hỗ trợ.
- 409: cần kết nối lại Google, xung đột dữ liệu, dữ liệu sau ghi chưa xác minh hoặc cần phục hồi journal. `CONCURRENT_OPERATION` dành cho tranh chấp khóa database tạm thời và cho phép retry; xung đột nghiệp vụ `STATE_CONFLICT` cần người dùng tải lại/đối soát.
- 422: dịch vụ ngoài từ chối yêu cầu hợp lệ về mặt HTTP nhưng cần sửa cấu hình/nơi nhận.
- 429: bị giới hạn tần suất; tuân thủ thời gian chờ từ nhà cung cấp nếu có.
- 502/503/504: phản hồi dịch vụ ngoài không hợp lệ, tạm không truy cập được hoặc timeout. `CONFIGURATION_ERROR` cũng trả 503 nhưng không tự retry.
- 500: lỗi không dự kiến; không trả nguyên exception message, SQL, token, response body của nhà cung cấp hoặc stack trace.

`fieldErrors` mô tả field lỗi từ Spring binding/validation, không chứa rejected value. Các lỗi framework được xử lý bằng `ResponseEntityExceptionHandler`; servlet error dispatch còn lại dùng `ApiErrorAttributes` an toàn.

Đây là hợp đồng JSON tương thích của HybridFlow, không tuyên bố là RFC Problem Details. Caller vẫn đọc được `message`, nhưng phải cập nhật nếu từng giả định mọi lỗi nghiệp vụ đều là 400 hoặc mọi lỗi ghi đều là 500.

## Exception trong code

Controller chỉ nhận HTTP và gọi service interface. Không thêm try/catch nghiệp vụ, phân loại lỗi hoặc SQL vào controller.

- Dùng `ValidationException` cho lỗi đầu vào mà ứng dụng biết cách hướng dẫn người dùng sửa.
- Dùng `ApplicationException(ErrorCode, message)` cho lỗi nghiệp vụ/hạ tầng đã phân loại. `message` phải là thông báo an toàn do ứng dụng định nghĩa, không truyền `providerException.getMessage()` vào đó.
- Adapter Google/Telegram chuyển status nhà cung cấp sang lỗi ứng dụng qua `ExternalErrors`; không chuyển nguyên provider response ra UI.
- Giữ cause khi hữu ích cho debug, nhưng không log nguyên cause/exception tại các boundary vì URL hoặc SQL trong đó có thể chứa thông tin nhạy cảm. Log của boundary ghi code, correlation ID và loại exception.
- Không đổi mọi exception thành lỗi có thể retry. Lỗi không dự kiến mặc định dừng tự thử và cần điều tra.

Không dùng Java `record`, kiểu suy luận `var`, wildcard import hoặc tên thư viện đầy đủ ngay trong thân code. Service interface nằm trong `service`; implementation nằm trong `service.impl`; SQL nằm trong repository; DTO nằm trong `dto`; logic phân loại dùng chung nằm trong `common`.

## Worker và dữ liệu bền vững

Migration V12 thêm `error_code` và `correlation_id` vào `sync_executions`, `workflow_jobs`, `notification_outbox`. Lịch sử cũ giữ NULL cho hai trường này, không suy đoán mã từ thông báo cũ.

Worker sync dùng ID job làm correlation ID. Lỗi cần kết nối lại chuyển `NEEDS_CONNECTION`; lỗi đầu vào/cấu hình, lỗi nghiệp vụ không thể tự phục hồi và lỗi không dự kiến chuyển `DEAD`; lỗi tạm thời retry có giới hạn, chờ ít nhất thời gian backoff hoặc thời gian nhà cung cấp yêu cầu. Bootstrap tiếp tục là kết quả `NEEDS_BOOTSTRAP`, không bị biến thành exception.

Execution ghi thông báo an toàn, mã lỗi và correlation ID trong transaction lịch sử riêng. Outbox giữ correlation ID của thao tác tạo tin, lưu mã lỗi khi gửi thất bại và dùng cùng quy tắc retryable. Retry tin chỉ dùng lại mục outbox hiện có, không chạy lại đồng bộ. Khi gửi/chạy thành công, mã lỗi hiện tại được xóa; correlation ID vẫn phục vụ tra cứu.

Scheduler bắt lỗi ở ranh giới tác vụ, ghi chẩn đoán an toàn và cho chu kỳ sau tiếp tục. Lease/idempotency/journal hiện có tiếp tục bảo vệ công việc dở dang.

## OAuth và frontend

OAuth callback trả HTML cho cả thành công lẫn thất bại, với HTTP status tương ứng. Trang lỗi gửi `GOOGLE_OAUTH_ERROR` gồm code/message/correlationId tới đúng frontend origin; không nhúng code OAuth hoặc mô tả tùy ý của nhà cung cấp. Dữ liệu JavaScript được JSON-escape và nội dung hiển thị qua `textContent`.

Frontend vẫn xác minh origin và cửa sổ gửi message. `errorDetails` chuẩn hóa lỗi API, lỗi mạng, timeout và hủy request; `errorMessage` hiển thị thông báo cùng mã tra cứu khi có. Không hiện raw Axios message hoặc trang HTML lỗi từ proxy. Lỗi validation cục bộ bằng `Error` vẫn hiển thị được. Polling so sánh code/message, bỏ qua correlation ID và không báo lỗi cho request đã hủy. Không tự động replay request có side effect ở HTTP client.

## Kiểm chứng

Chạy frontend tests/build và backend tests, gồm `ControllerArchitectureTest`, `ServiceArchitectureTest`. Integration tests chỉ được bật với PostgreSQL tạm tại `127.0.0.1:15432/hybridflow_test` theo hướng dẫn README; chúng kiểm tra migration, trạng thái retry, metadata lỗi và transaction thực. Google/Telegram được giả lập tại biên dịch vụ; cần tài khoản thật để nghiệm thu end-to-end với nhà cung cấp.
