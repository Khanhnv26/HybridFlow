# Biên bản nghiệm thu Rẽ Nhánh Điều Kiện + nhiều đích Telegram

Ngày: 03/11/2026. Phạm vi: mã nguồn hiện tại, gồm cả thay đổi chưa commit, đối chiếu kế hoạch người dùng cung cấp trong `Pasted text.txt`.

**Kết luận sau sửa: các lỗi F1–F12 đã được xử lý và kiểm thử tự động đạt.** Phần đầu là kết quả xác minh mới nhất; phần sau giữ lại các phát hiện nghiệm thu ban đầu để truy vết.

## Kết quả sau sửa — 03/11/2026

**Đã sửa F1–F12 và vượt qua bộ kiểm thử tự động.** Frontend: **107/107 test**, build thành công. Backend: **169/169 test**, không failure/error và **không test bị bỏ qua**. Kiểm thử tích hợp chạy trên PostgreSQL **18.6** tạm, chỉ lắng nghe localhost:15432; không dùng dữ liệu ứng dụng đang vận hành.

Sửa bổ sung lỗi treo khi vừa mở router: hai component cấu hình trước đây dùng cùng React key theo node ID. Đã tách key router-config/node-config; ổn định dependency tải preview, bắt lỗi đọc, hủy request khi đóng và thêm thông báo lỗi/nút đọc lại. Ba test hồi quy ở AppSources.test.mjs kiểm tra key, chu kỳ mở/đóng và đọc lỗi/đọc lại. Build thành công; chưa xác minh trực tiếp trên tab Chrome đang dùng.

Các thay đổi đã xác minh:

- Router lưu đúng routerTriggerOn/routerMatchMode/routerConditions; đọc tương thích các bản nháp từng lưu tên trường cũ, giữ nguyên khoảng trắng của giá trị so sánh. Chỉnh router/Telegram không đổi flowId.
- Cả Sheet–Vault và nhiều Sheet phát CREATED/UPDATED từ checkpoint thật; bootstrap và dữ liệu không đổi không phát event; dòng xung đột một phần vẫn phát thay đổi cột sạch.
- Mỗi action loại trùng trước giới hạn 20; hai nguồn RECORD/CONFLICT dùng chung giới hạn. Phần vượt được gộp một tin; các khóa nguồn đã gộp được lưu SKIPPED để conflict mở không xuất hiện lại ở lượt sau.
- notificationsQueued đếm đúng số hàng PENDING thực sự được thêm. Request notifyConflicts/chatId cũ chuyển thành action ổn định và dùng outbox, không gửi Telegram trong transaction.
- 429 chờ retry_after và hoàn lại attempts; 403 DEAD; 500 retry. Tin SENDING hết lease ở attempt cuối vẫn được phục hồi và owner cũ không được cập nhật kết quả. Đích lỗi không chặn đích tiếp theo trong batch.
- Sender dùng interface NotificationSender. Nội dung lưu sẵn được gửi nguyên bản, không parse_mode; nội dung cắt theo Unicode code point. Lỗi gửi không lưu bot token vào last_error.
- Biến template conflict thống nhất: recordId, columnName, baseValue, valueA, valueB; giữ bí danh id/column. Validate template sau READ, trước WRITE; frontend có báo biến sai và preview từ dữ liệu đã đọc.
- API danh sách lọc executionId; retry có đúng đường dẫn /api/v1/notifications/{id}/retry. Giao diện polling từng action, thể hiện đang chờ/đang gửi/đã gửi/lỗi và cho thử lại DEAD/FAILED trong cấu hình Telegram.
- Phase ROUTE dùng router:<id>, phase NOTIFY dùng action:<id>. Node Telegram hiện số nhánh vào; dây Sheet legacy có hướng dẫn chuyển cổng; gửi lại conflict áp dụng cho các đích thực sự nối nhánh conflict.
- Frontend và parser từ chối Telegram không nối dây, điều kiện thiếu value/sai toán tử; modal router giới hạn cột theo phạm vi đồng bộ và có preview số dòng theo giá trị hiện tại. Preview ghi rõ cần snapshot để xác nhận KHI/CHANGED_TO.

Đối chiếu ca bắt buộc sau sửa:

1. API thật + PostgreSQL xác nhận hai router, ba đích, mỗi template riêng.
2. Test outbox xác nhận hai router cùng khớp không tiêu hao giới hạn hai lần; một record/action chỉ một hàng.
3. API thật xác nhận cùng action nhận RECORD/CONFLICT với template đúng.
4–5. Test cả hai chế độ và API xác nhận bootstrap/no-change không tạo tin.
6. Test cả hai chế độ xác nhận status sạch vẫn tạo event khi note xung đột.
7. API/PostgreSQL xác nhận conflict mở không xếp hàng lại; test còn bao phủ khóa conflict đã gộp.
8. Test API gây lỗi DB lúc enqueue sau khi Sheet đã ghi: checkpoint/outbox rollback; lượt sau tạo lại đủ ba thông báo.
9. HTTP Telegram giả lập xác nhận 500/429/403; test worker xác nhận đích lỗi không chặn đích khác.
10. PostgreSQL xác nhận phục hồi lease ở attempt cuối và chặn owner cũ.
11. Test 100 record khớp hai router xác nhận 20 tin riêng + một tin tổng hợp đúng 80 record còn lại.
12. PostgreSQL xác nhận lưu/mở lại giữ node/edge/template; chạy tay và chạy lịch dựng cùng flowId/router/action/nhánh conflict.
13. Giữ các test dây Sheet legacy; request chatId cũ được kiểm tra qua API và worker outbox.

Google Sheets và Telegram được giả lập tại biên dịch vụ/HTTP trong các test; **chưa gửi thử trên tài khoản Google/Telegram thật**. Vite còn cảnh báo kích thước bundle trên 500 kB; build vẫn thành công. Database tạm được dừng và xóa sau kiểm thử.

---

## Phát hiện nghiệm thu ban đầu (trước sửa)

## Bằng chứng kiểm thử

- `frontend`: `npm test` đạt 99/99; `npm run build` thành công. Vite cảnh báo bundle lớn hơn 500 kB.
- `backend`: `mvn -o test` thành công; 141 test được thống kê, 119 đạt, 22 bị bỏ qua, không failure/error.
- 22 test bị bỏ qua thuộc `SyncApiIntegrationTest` (9) và `WorkflowScheduleIntegrationTest` (13), vì chưa có `HYBRIDFLOW_TEST_DB_URL`. Docker daemon không hoạt động. Chưa xác minh transaction, migration V10, claim/lease trên PostgreSQL thật.
- Tái hiện riêng bằng React test renderer + hàm `workflowConfig` thật: modal lưu `{"triggerOn":"CHANGED","matchMode":"ALL","conditions":[{"columnName":"id","operator":"EQUALS","value":"READY"}]}`; bộ dựng workflow trả lỗi `Khối Rẽ Nhánh Điều Kiện cần ít nhất một điều kiện.` Các module tạm đã được xóa.
- Không gửi Telegram thật hoặc sửa dữ liệu Google Sheets. Các kết luận chưa có test động được ghi rõ là đối chiếu mã nguồn.

## Lỗi cần sửa

### F1 — P1: Modal lưu sai contract router

`frontend/src/components/orchestration/RouterConditionConfigModal.tsx:82` lưu `triggerOn`, `matchMode`, `conditions`; trong khi `frontend/src/services/workflow.ts:122` và `backend/src/main/java/com/hybridflow/sync/support/WorkflowGraphParser.java:249` đọc `routerTriggerOn`, `routerMatchMode`, `routerConditions`.

Router mới cấu hình qua UI không chạy được. Router có cấu hình cũ vẫn chạy điều kiện cũ sau khi người dùng chỉnh sửa. Đã tái hiện động với modal và workflowConfig. Cần thống nhất tên trường trên đường lưu, mở lại, hiển thị và dựng request.

### F2 — P1: Mất sự kiện của dòng xung đột một phần

`backend/src/main/java/com/hybridflow/sync/service/impl/SyncExecutionServiceImpl.java:231` và `:432` chỉ tạo event khi dòng không còn trường xung đột. Tuy nhiên checkpoint vẫn lưu các cột sạch trước khi enqueue.

Với status đổi sạch và note xung đột, status được lưu checkpoint nhưng router không nhận event; lượt sau không còn chênh lệch status để phát hiện lại. Vi phạm ca 6 ở cả hai chế độ đồng bộ. Cần tạo event từ các cột sạch đã đổi và đưa các cột đang xung đột vào `conflictedColumns`. Kết luận từ mã nguồn.

### F3 — P1: HTTP 429 vẫn tiêu hao số lần thử

`backend/src/main/java/com/hybridflow/sync/repository/NotificationOutboxRepository.java:83` tăng attempts ở mọi lần claim. `backend/src/main/java/com/hybridflow/sync/service/impl/NotificationOutboxServiceImpl.java:164` chuyển DEAD khi attempts đạt 5, kể cả kết quả 429 có retryAfterSeconds.

Đích liên tục bị giới hạn tần suất có thể DEAD sau 5 lần, trái yêu cầu 429 không tính attempts. Cần phân biệt rate limit với lỗi gửi thông thường. Kết luận từ mã nguồn.

### F4 — P1: Worker chết ở lần claim cuối làm tin kẹt SENDING

`backend/src/main/java/com/hybridflow/sync/repository/NotificationOutboxRepository.java:77` áp điều kiện `attempts < maxAttempts` cho cả tin SENDING hết lease. Nếu claim tăng attempts từ 4 lên 5 rồi worker chết trước khi cập nhật kết quả, không worker nào claim lại được dù lease đã hết; retry thủ công cũng chỉ nhận FAILED/DEAD.

Vi phạm ca 10. Cần có đường phục hồi hoặc kết thúc rõ ràng cho SENDING hết lease ở ngưỡng attempts. Kết luận từ SQL, chưa chạy PostgreSQL.

### F5 — P1: Template xung đột kiểm tra và render bằng hai tập biến khác nhau

`backend/src/main/java/com/hybridflow/sync/service/impl/SyncExecutionServiceImpl.java:156` và `:352` validate conflictTemplate theo tên cột đồng bộ. Trong khi `backend/src/main/java/com/hybridflow/sync/service/impl/NotificationTemplateServiceImpl.java:73` chỉ thay `{recordId}`, `{columnName}`, `{baseValue}`, `{valueA}`, `{valueB}`.

Ví dụ schema id/status: template `{recordId}` bị chặn trước WRITE; template `{id}` vượt validate nhưng gửi nguyên chuỗi `{id}`. UI còn gợi ý `{id}` và `{column}`. Cần thống nhất contract biến conflict giữa backend và UI. Kết luận từ mã nguồn.

### F6 — P2: Chống trùng diễn ra sau giới hạn 20 nên gộp tin sai

`backend/src/main/java/com/hybridflow/sync/service/impl/NotificationOutboxServiceImpl.java:60` thêm event vào danh sách một lần cho mỗi router khớp. Giới hạn 20 tại `:73` áp trước khi unique key ở DB loại trùng.

Ví dụ 15 bản ghi cùng khớp 2 router dẫn tới một action: danh sách có 30 phần tử; 20 phần tử đầu chỉ chứa 10 bản ghi duy nhất, và tổng hợp ghi còn 10 thay vì gửi đủ 15 tin riêng. Cần loại trùng theo action + event trước khi đếm và gộp. Kết luận từ thuật toán.

### F7 — P2: Nhánh xung đột không có giới hạn/gộp tin

`backend/src/main/java/com/hybridflow/sync/service/impl/NotificationOutboxServiceImpl.java:130` enqueue mọi conflict, không áp giới hạn 20 của mỗi action/mỗi lượt. Action nhận cả RECORD và CONFLICT cũng không có bộ đếm chung. Cần áp giới hạn theo action/lượt trên tập tin thực sự sẽ được tạo. Kết luận từ mã nguồn.

### F8 — P1: Request legacy vẫn gửi trực tiếp trong transaction

`backend/src/main/java/com/hybridflow/sync/service/impl/SyncExecutionServiceImpl.java:296` và `:485` còn gọi sendConflictAlert khi request dùng notifyConflicts/chatId mà thiếu conflictActionIds. Không có bước chuyển request cũ thành ActionPlan như kế hoạch.

Legacy bỏ qua outbox; Sheet–Vault tiếp tục gửi lại conflict mở; nếu DB commit thất bại sau khi gửi, tin đã đến Telegram. Cần chuẩn hóa request legacy thành action trước thực thi. Kết luận từ mã nguồn.

### F9 — P2: Giao diện chưa theo dõi trạng thái outbox, tiến trình router sai role

`frontend/src/services/api.ts` chưa có API lấy thông báo/retry; App chưa polling outbox, toast tại `frontend/src/App.tsx:410` vẫn dùng notificationsSent/Failed. `frontend/src/services/executionVisuals.ts:37` vẫn suy trạng thái Telegram từ notificationsFailed.

Backend gọi phase với role `router` tại `SyncExecutionServiceImpl.java:274` và `:470`, nhưng parser chỉ khai báo `router:<id>` tại `WorkflowGraphParser.java:350`. Vì vậy phase ROUTE không ánh xạ đúng router cụ thể. Cần lấy trạng thái từng action từ outbox và phát đúng node ID. Kết luận từ mã nguồn.

### F10 — P2: notificationsQueued đếm event thay vì số tin đã thêm

`backend/src/main/java/com/hybridflow/sync/service/impl/SyncExecutionServiceImpl.java:276` và `:472` cộng số event trước lọc rule/fan-out/chống trùng. Có thể trả 1 khi không router nào khớp (thực tế 0 tin), hoặc trả 1 khi event đi 3 action (thực tế 3 tin). Phần conflict cũng đếm conflict thay vì số lần insert thành công.

Cần trả số hàng thực sự được enqueue sau dedup/gộp, dùng giá trị đó cho toast. Kết luận từ mã nguồn.

### F11 — P2: API thông báo chưa đúng contract

`backend/src/main/java/com/hybridflow/sync/controller/WorkflowController.java:64` chỉ nhận flowId/limit, không lọc executionId. Retry tại `:70` đang là `/api/v1/workflows/notifications/{id}/retry`, kế hoạch yêu cầu `/api/v1/notifications/{id}/retry`.

Cần bổ sung filter theo executionId và endpoint đúng đường dẫn. Kết luận từ mã nguồn.

### F12 — P2: Kiểm tra sớm và preview chưa đủ

Frontend workflowConfig mới kiểm tra có điều kiện, chưa kiểm tra đầy đủ operator/value; Telegram không nối dây bị bỏ qua thay vì bị từ chối. Backend parser cũng bỏ qua Telegram không nối dây. Router modal chưa có xem trước số dòng khớp; TelegramConfig chưa có xem trước bản ghi thật hoặc báo biến template sai trước khi lưu. Cần hoàn thiện theo mục 2.3, 4.3 và 7 của kế hoạch.

## Đối chiếu 13 ca bắt buộc

1. **Chưa đạt qua UI**: F1 chặn router mới; còn F5 về template. Chưa gửi thử ba đích thật.
2. **Chưa đủ bằng chứng**: SQL unique key có thể loại tin trùng cho một record; chưa test PostgreSQL. Khi nhiều record cùng khớp nhiều router, F6 gây mất tin riêng/gộp sai.
3. **Chưa đạt**: F5 làm template conflict không nhất quán với validator/UI.
4. **Chưa xác minh đầy đủ**: có nhánh chặn record event khi bootstrap; chưa có test nghiệm thu tích hợp cho toàn bộ thông báo.
5. **Chưa xác minh đầy đủ**: có so sánh before/after; chưa có test tích hợp no-change + outbox cho cả hai chế độ.
6. **Không đạt**: F2 ở cả hai chế độ.
7. **Chưa đạt toàn bộ phạm vi**: nhánh outbox dùng conflictId để chống trùng, chưa kiểm PostgreSQL; legacy Sheet–Vault còn gửi trực tiếp lặp lại (F8).
8. **Chưa đạt toàn bộ phạm vi**: checkpoint và enqueue mới nằm trong transaction executeSync, nhưng chưa test rollback DB thật; legacy vẫn có thể gửi trước rollback (F8).
9. **Không đạt**: 429 vẫn tiêu hao attempts (F3). Có nhánh xử lý 500/403 trong mã, chưa kiểm thử outbox động.
10. **Không đạt**: trường hợp chết ở lần claim cuối bị kẹt (F4).
11. **Chưa đạt toàn bộ phạm vi**: một router/record-only có giới hạn trong mã; nhiều router gây F6, nhánh conflict gây F7. Chưa test 100 dòng trên DB thật.
12. **Không đạt qua UI**: F1 làm lưu/mở lại không áp dụng đúng router. 13 test lịch hiện bị bỏ qua; chưa xác minh tương đương chạy tay/chạy lịch với tính năng mới.
13. **Chỉ đạt một phần theo mã/test cũ**: parser vẫn nhận dây Sheet legacy; request notifyConflicts/chatId còn chạy trực tiếp và không đạt thiết kế outbox (F8). Chưa nghiệm thu end-to-end workflow cũ.

## Điều kiện để nghiệm thu lại

- Sửa các lỗi P1, sau đó xử lý giới hạn/gộp tin, API và trạng thái UI.
- Bổ sung test hồi quy modal → lưu definition → parser; sự kiện bootstrap/created/updated/no-change/partial-conflict ở cả hai chế độ.
- Bổ sung test outbox chống trùng trước gộp, 100 dòng, 429 không tăng attempts, 403 DEAD, retry 500, worker chết ở attempt cuối, rollback checkpoint/outbox.
- Chạy PostgreSQL test riêng và kiểm đủ 13 ca; kiểm tra nhiều đích bằng sender giả lập trước khi gửi thử có kiểm soát trên Telegram/Sheets thật.

Các phát hiện phía trên ghi nhận trạng thái trước sửa. Xem kết quả sửa và xác minh mới nhất ở đầu biên bản.
