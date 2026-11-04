# Chặng 1 — Khép kín vận hành

Ngày cập nhật: 04/11/2026.

## Phạm vi

Hoàn thiện FR-016/FR-020: xem Outbox của từng execution, theo dõi trạng thái giao nhận và retry riêng từng thông báo. Củng cố bằng chứng FR-018/FR-019: năm workflow độc lập chạy đồng thời, job/outbox lưu bền vững, lease và chống tạo trùng.

`sheetWriteAction` độc lập, tài khoản/workspace, webhook và template nằm ngoài đợt này theo phân kỳ đã điều chỉnh. Việc ghi Sheet trong bộ đồng bộ hiện có tiếp tục được kiểm thử apply/verify, journal và rollback.

## Hành vi nghiệm thu

- Mở Lịch sử, chọn Xem thông báo ở một lượt chạy cũ: chỉ lấy thông báo đúng flow/execution; mở lượt khác không giữ phản hồi của lượt trước.
- Hiển thị nội dung, node gửi, nơi nhận, trạng thái, số lần thử trong đợt hiện tại, thời điểm tạo/gửi/thử tiếp, mã lỗi và correlation ID. Trạng thái gửi độc lập với kết quả sync.
- Phân trang 50 thông báo; tự cập nhật 2 giây khi mở. Đóng chi tiết/drawer hoặc đổi flow hủy yêu cầu cũ; tab ẩn tạm dừng polling.
- Tải lỗi hiển thị lỗi, không suy diễn thành không có thông báo. Lần tải thành công tiếp theo gỡ lỗi tải; lỗi retry hiển thị riêng.
- Chỉ FAILED/DEAD có nút thử lại. Trong khi yêu cầu retry đang chạy, chặn bấm lặp. Backend kiểm tra trạng thái bằng UPDATE có điều kiện, không reset SENT/SENDING/PENDING. Không chạy lại sync hoặc tạo hàng Outbox mới.
- Checkpoint và Outbox rollback cùng nhau khi giao dịch lỗi; khóa sự kiện/revision ngăn tạo trùng khi chạy lại không đổi dữ liệu.
- Lease hết hạn được worker mới nhận lại, owner cũ không thể đánh dấu SENT. Tái tạo repository/worker vẫn đọc và xử lý hàng đã lưu trong PostgreSQL.
- Năm job trên năm nguồn độc lập cùng vào bước thực thi trước khi bất kỳ job nào kết thúc; lease hết hạn không chiếm được job đang giữ row lock. Outbox của workflow khác vẫn gửi được khi cả năm job bị giữ tại bước sync.

## Bằng chứng tự động

Kết quả chạy ngày 04/11/2026: frontend **133/133 đạt**, backend **206/206 đạt, 0 skipped**; frontend production build thành công. Integration test dùng PostgreSQL **18.6** cục bộ riêng tại cổng 15432; Flyway áp dụng thành công đến V13. Cấu hình Docker trong README dùng PostgreSQL 16; phiên bản 16 chưa được chạy lại trong đợt này do Docker daemon không hoạt động.

Log kiểm thử được lưu cục bộ tại `backend/target/stage1-backend.log` và `backend/target/stage1-frontend.log` (không đưa vào Git).

- `frontend/tests/RunHistoryDrawer.test.mjs`: chọn execution cũ, retry đúng thông báo, hủy phản hồi cũ, lỗi và phục hồi polling, phân trang, chặn retry trùng, lỗi retry.
- `backend/.../NotificationOutboxRepositoryIntegrationTest.java`: khóa chống trùng, lọc execution, phân trang cùng thời điểm tạo, rollback checkpoint/outbox, lease recovery, fencing owner, backoff/rate limit và retry.
- `backend/.../SyncApiIntegrationTest.java`: API thật qua Spring MVC/PostgreSQL, phân trang/lọc execution, offset không hợp lệ, retry sai trạng thái; rollback và tái tạo sự kiện sau lỗi ghi.
- `backend/.../WorkflowScheduleIntegrationTest.java`: năm job đồng thời và Telegram độc lập, retry hữu hạn, lease recovery, disable/config revision, ngừng khi cần bootstrap/kết nối lại.
- Các integration test Google/Telegram thay dịch vụ nhà cung cấp bằng mock; không gửi tin hoặc ghi Sheet thật. Bài lease recovery mô phỏng tiến trình chết bằng lease hết hạn/tái tạo worker, không khởi động lại hệ điều hành.

## Chạy kiểm tra

Frontend: `npm test` và `npm run build` trong `frontend`.

Backend: `mvn test` trong `backend`, dùng JDK 21. Để chạy cả integration test, đặt `HYBRIDFLOW_TEST_DB_URL=jdbc:postgresql://127.0.0.1:15432/hybridflow_test`, user/password kiểm thử `hybridflow_test`. Chỉ dùng database tạm: các test truncate bảng ứng dụng. Cách tạo PostgreSQL kiểm thử bằng Docker đã có trong README.

Migration V13 bổ sung index cho truy vấn Outbox theo flow/execution và phân trang; không sửa lịch sử migration cũ. Worker mặc định tăng từ 4 lên 5; giá trị `SCHEDULER_WORKERS` tùy chỉnh vẫn được ưu tiên.

## Giới hạn giao nhận

Chống tạo trùng Outbox không đảm bảo Telegram nhận đúng một lần nếu tiến trình chết sau khi Telegram nhận tin nhưng trước khi lưu SENT. Lease recovery có thể gửi lại trong cửa sổ này. Xem chi tiết lịch sử và cân nhắc trạng thái phía người nhận trước khi retry thông báo có kết quả không chắc chắn.
