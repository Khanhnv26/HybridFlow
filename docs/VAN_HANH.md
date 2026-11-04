# Vận hành và kiểm thử

## Kết nối và chạy thử

1. Đăng nhập, chọn workspace → module → workflow.
2. Kết nối Google Sheets, chọn file/tab và cột ID duy nhất. Header không trống/trùng; mọi dòng dữ liệu phải có ID không trùng.
3. Với nhiều Sheet, chọn rõ các cột chia sẻ. Các nguồn phải có đủ cột; thứ tự nguồn trong cấu hình quyết định chính sách ưu tiên.
4. Chạy tay và xác nhận bootstrap trước khi bật lịch. Đổi nguồn, cột chia sẻ, transform hoặc kiểu dữ liệu tạo ngữ cảnh mới.
5. Khi xung đột, chọn giá trị mong muốn; backend đọc lại, ghi và verify trước khi lưu checkpoint. Dữ liệu đã thay đổi phải chạy lại đối soát.
6. Mở Lịch sử → Xem thông báo để xem Outbox từng execution. Retry chỉ xử lý thông báo lỗi đã chọn, không chạy lại đồng bộ.

Việc tích hợp workspace còn đang hoàn thiện; các phần còn thiếu được ghi ở [Chặng 2](CHANG_2.md).

## An toàn dữ liệu

- Không lan truyền xóa dòng tự động. Dòng đã có snapshot mà bị thiếu trên một nguồn sẽ yêu cầu khôi phục/đối soát.
- Google Sheets không có giao dịch chung với PostgreSQL. Không coi timeout là bằng chứng chưa ghi; chạy lại để reconcile.
- `sheet_write_journal` giữ intent bền vững trước khi ghi. Không xóa intent PENDING để bỏ qua lỗi. Nếu có chỉnh sửa mới, hệ thống dừng thay vì rollback đè lên dữ liệu đó.
- Khóa theo file phối hợp các workflow HybridFlow; không khóa thao tác sửa trực tiếp của người dùng Google Sheets.
- Checkpoint/revision/Outbox commit cùng giao dịch. Revision chỉ tăng khi dữ liệu đổi; chạy lại không đổi không tạo lại sự kiện.
- Telegram có thể nhận tin trước khi backend lưu SENT. Lease recovery không phải cam kết giao nhận đúng một lần.

## Rule và kiểu cột

Nối `clean` của Điều phối & Đồng bộ → Điều kiện → Telegram. Cổng `conflict` dùng riêng cho cảnh báo xung đột. Chưa hỗ trợ nhánh False hoặc chuỗi điều kiện.

Điều kiện chạy trên sự kiện thêm/sửa đã xác minh. Bootstrap, phản chiếu hoặc sửa kiểu ô không tạo thông báo bản ghi; bản ghi còn conflict không phát thông báo nghiệp vụ. Preview chỉ kiểm tra giá trị hiện tại, không dự đoán số tin gửi.

Kiểu NUMBER ghi bằng JSON number với RAW, dùng dấu chấm thập phân và tối đa 15 chữ số có nghĩa. Ô trống không phải số 0. Cột khóa, mã và số điện thoại nên giữ TEXT. Đổi kiểu tạo context mới.

## Lịch và Outbox

Lịch backend chạy độc lập với trình duyệt. Poll 5 giây, tối đa 5 worker mặc định; job có lease và retry hữu hạn. Lỡ nhiều kỳ chỉ tạo một lượt bù, không chạy dồn tất cả lượt đã lỡ.

NEEDS_BOOTSTRAP yêu cầu chạy tay/xác nhận; NEEDS_CONNECTION yêu cầu kết nối lại; DEAD cần xử lý lỗi trước khi tiếp tục. Tắt lịch/đổi cấu hình hủy job cũ chưa bắt đầu; job đang chạy được hoàn tất an toàn.

Outbox cập nhật khi đang mở, phân trang 50 thông báo. Chỉ FAILED/DEAD được retry. Lỗi tải không được hiển thị thành “không có dữ liệu”.

## Secrets và triển khai

- Giữ `client_secret.json` và `backend/application-local.properties` ngoài Git.
- Không đổi/xóa khóa mã hóa Google khi còn connection đã lưu. Sao lưu khóa cùng quy trình sao lưu database.
- Nếu Telegram token bị lộ, thu hồi tại BotFather. Có thể cập nhật cấu hình local bằng `scripts/set-telegram-token.ps1` từ gốc repo; thao tác này không thay thế thu hồi token cũ.
- Production dùng HTTPS, SESSION_COOKIE_SECURE=true, callback/origin đúng domain. Reverse proxy `/api`, `/oauth2`, `/login/oauth2` về backend.
- Trước nâng cấp: sao lưu DB, đối chiếu migration và tắt scheduler nếu đang chuyển dữ liệu tenant. Không sửa Flyway history của database đang dùng.

## Kiểm thử

Frontend, trong `frontend`: `npm test`, `npm run build`.

Backend, trong `backend` với JDK 21: `mvn test`. Khi không bật database kiểm thử, một số integration test được bỏ qua; không ghi nhận skipped là passed.

PostgreSQL tạm dùng riêng cổng 15432, database/user/password `hybridflow_test`:

```powershell
docker run --rm --name hybridflow-sync-verify -d -e POSTGRES_DB=hybridflow_test -e POSTGRES_USER=hybridflow_test -e POSTGRES_PASSWORD=hybridflow_test -p 127.0.0.1:15432:5432 postgres:16-alpine
$env:HYBRIDFLOW_TEST_DB_URL = 'jdbc:postgresql://127.0.0.1:15432/hybridflow_test'
mvn test
docker stop hybridflow-sync-verify
```

Chỉ dùng DB tạm: các bài kiểm thử engine có truncate bảng ứng dụng. Google/Telegram được giả lập trong kiểm thử tự động; callback/consent và thao tác trên file thật cần kiểm tra riêng.

Các bài engine dùng API cũ có thể chạy không gắn Security Filter để kiểm tra pipeline; kiểm thử isolation riêng phải bật filter thật và chứng minh các API cũ bị chặn.

Khi JVM bị hạn chế attach/fork, dùng `mvn -DforkCount=0 test` với Byte Buddy agent nạp sẵn bằng MAVEN_OPTS (xem version jar đang có trong dependency của dự án).

Lỗi HTTP, correlation ID và retry contract xem [ERROR_HANDLING](../ERROR_HANDLING.md).
