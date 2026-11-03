# HybridFlow

Đồng bộ nhiều Google Sheet theo từng bản ghi/cột, lưu snapshot và phê duyệt xung đột theo từng luồng. Vẫn hỗ trợ luồng Google Sheet ↔ Vault cũ.

## Chạy ứng dụng

Yêu cầu JDK 21, Maven, Node.js và PostgreSQL. `docker compose up -d postgres` có thể dùng để tạo database phát triển theo `docker-compose.yml`.

Backend đọc các biến môi trường:

- `DB_URL`, `DB_USER`, `DB_PASSWORD`: kết nối PostgreSQL. Mặc định phát triển là `localhost:5432/hybridflow`, user `postgres`.
- `TELEGRAM_BOT_TOKEN`: token bot Telegram; Chat ID gửi cảnh báo lấy từ khối Telegram trên giao diện.
- `GOOGLE_REDIRECT_URI`: mặc định `http://localhost:8080/api/v1/connections/google/callback`; phải khớp OAuth client trên Google Cloud.
- `FRONTEND_ORIGIN`: mặc định `http://localhost:3000`, dùng cho CORS và đích nhận kết quả OAuth popup. Đổi khi dùng cổng/origin khác.
- `GOOGLE_CREDENTIAL_ENCRYPTION_KEY`: khóa Base64 của 32 byte ngẫu nhiên, dùng AES-256-GCM để mã hóa access/refresh token trong database. Giữ nguyên khóa qua các lần restart và dùng cùng khóa trên mọi backend. Có thể đặt `google.oauth.encryption-key` trong `backend/application-local.properties` đã được Git bỏ qua. Không đưa khóa vào Git hoặc log; sao lưu khóa cùng quy trình sao lưu database.
- `SCHEDULER_ENABLED` (mặc định `true`), `SCHEDULER_WORKERS` (mặc định `4`): bật bộ lập lịch và giới hạn số worker trên mỗi backend.

File `client_secret.json` của Google OAuth đặt trong `backend/src/main/resources/` và được Git bỏ qua. Các thiết lập riêng đã có được giữ trong `backend/application-local.properties` (cũng được Git bỏ qua). Khi chạy từ thư mục `backend` hoặc gốc repo, Spring tự đọc file local này; biến môi trường có thể ghi đè các giá trị được chuyển sang đó. Không commit token hay file local. Nếu token từng được đưa lên Git, cần thay token tại nhà cung cấp.

Chạy backend từ `backend`: `mvn spring-boot:run`. Khởi động lại backend sau khi cập nhật mã để Flyway áp dụng các migration mới, hiện đến V12. Không sửa/xóa lịch sử migration trong database đang dùng.

Chạy frontend từ `frontend`: `npm install`, sau đó `npm run dev`. Vite chạy ở cổng 3000 và proxy `/api` sang backend 8080. Khi deploy, cấu hình reverse proxy `/api` hoặc đặt `VITE_API_BASE_URL` theo `frontend/.env.example` trước khi build. Nếu cổng 3000 bận, cấu hình `FRONTEND_ORIGIN` theo origin thực tế.

## Sử dụng dữ liệu thật

1. Kết nối Google bằng nút góc phải.
2. Mở khối Google Trang Tính, dán link chia sẻ (vẫn nhận mã file cũ). Kết nối Google ngay trong modal nếu cần; dropdown tự tải danh sách trang tính thật từ file. Link có `gid` sẽ chọn sẵn tab tương ứng. Có thể xem trước dữ liệu rồi bấm **Lưu nguồn dữ liệu**; đóng hoặc Hủy không đổi nguồn đang dùng, lưu thất bại giữ nguyên cấu hình cũ. Sau đó điền tên cột khóa duy nhất tại khối so khớp. Header phải không trống/không trùng; các dòng có dữ liệu phải có khóa, không trùng khóa.
3. Nối Google Sheet → So khớp (`out` → `in`) → Kho lưu trữ (`clean` → `in`). Tên vùng lưu trữ là một phân vùng dữ liệu trong Vault, không phải tên bảng SQL tùy ý.
4. Nếu cần Telegram, mở khối Telegram và chọn **Gửi cho tôi** hoặc **Gửi vào nhóm**. Tạo liên kết, mở bot và bấm Start / chọn nhóm để ứng dụng nhận nơi gửi. Có thể **Gửi tin nhắn thử** ngay khi chưa có xung đột. Bấm **Lưu cấu hình Telegram** mới đổi nơi nhận đang dùng; Hủy không thay đổi cấu hình. Nối cổng `conflict` của khối so khớp vào khối Telegram để bật cảnh báo tự động. Chat ID vẫn nhập được trong phần Thiết lập nâng cao.
5. Chạy luồng. Với nguồn mới, hệ thống yêu cầu bấm **Xác nhận khởi tạo** trước khi sao chép Sheet vào Vault/snapshot.
6. Chọn chính sách chờ duyệt, ưu tiên Sheet hoặc ưu tiên Vault. Chờ duyệt sẽ giữ nguyên checkpoint của riêng các trường đang xung đột; các trường sạch vẫn đồng bộ.
7. Phê duyệt conflict chỉ thành công sau khi ghi Google Sheet, Vault và snapshot. Nếu dữ liệu đã đổi kể từ lúc phát hiện, chạy lại đối soát trước khi chọn.

Nguồn file, tab, cột khóa và vùng lưu trữ tạo thành mã luồng ổn định. Đổi một trong các giá trị này tạo ngữ cảnh mới; backend kiểm tra binding để không dùng nhầm checkpoint. Cấu hình đang chỉnh được giữ ở trình duyệt; **Lưu cấu hình** và mỗi lần chạy sẽ lưu định nghĩa luồng lên backend. Lịch sử chạy và xung đột lấy từ backend theo mã luồng, không dựng mẫu khi API lỗi.

Đồng bộ hỗ trợ thêm dòng và cập nhật trường trên các dòng đã có. Dòng bị xóa khỏi Sheet trong khi vẫn có ở Vault sẽ báo lỗi để tránh xóa dữ liệu ngầm; cần khôi phục dòng hoặc chủ động khởi tạo một luồng mới. Các khối webhook và ghi Sheet độc lập chưa có bộ thực thi nên bị vô hiệu hóa. Khối chuẩn hóa và điều kiện đã hỗ trợ thực thi trong các đường nối được mô tả bên dưới. Tùy chọn **Tự động khi mở trang** chạy trong trình duyệt và dừng khi đóng trang; lịch backend bên dưới hoạt động độc lập với tùy chọn này.

## Quy tắc Khi–Nếu–Thì

Nối cổng Hành động (`clean`) của **Điều phối & Đồng bộ** vào **Rẽ Nhánh Điều Kiện**, rồi nối cổng **Thỏa điều kiện** (`out`) tới Telegram. Có thể tạo nhiều quy tắc độc lập và nhiều nơi nhận. Điều kiện không thỏa thì không gửi; chưa hỗ trợ cổng False, nối chuỗi điều kiện hay nối trực tiếp `clean` tới Telegram. Cổng `conflict` vẫn dùng riêng cho cảnh báo xung đột.

Trong khối Điều kiện, chọn Khi thêm dòng, sửa dòng hoặc cả hai; kết hợp điều kiện bằng tất cả/ít nhất một. Giữ nguyên cách so sánh chuỗi của `EQUALS`, `NOT_EQUALS`, `CONTAINS`, `CHANGED_TO`. Bổ sung `IS_EMPTY`, `COLUMN_CHANGED` và bốn phép so sánh số `<`, `>`, `<=`, `>=`. “Vừa đổi thành” và “Cột này vừa thay đổi” chỉ áp dụng cho dòng UPDATED có thay đổi thực tế; ba toán tử kiểm tra trống/có dữ liệu/cột thay đổi không cần nhập giá trị.

Để tạo cảnh báo tồn kho, chọn kiểu **Số** cho cột tồn kho trong khối Điều phối & Đồng bộ, rồi cấu hình Khi sửa dòng, Nếu tồn kho nhỏ hơn ngưỡng cố định (ví dụ 10), Thì gửi Telegram. Ô trống không phải số 0. Ngưỡng dùng dấu chấm thập phân, tối đa 15 chữ số có nghĩa theo quy tắc số của bảng tính. Dữ liệu NUMBER sai định dạng bị từ chối trước ghi; nếu bộ đánh giá rule nhận giá trị số không hợp lệ thì bỏ qua toàn bộ rule cho bản ghi đó, kể cả chế độ ít nhất một, và ghi lý do vào log mà không ghi giá trị ô.

Preview chỉ kiểm tra giá trị hiện tại của bảng đang chọn, không dự đoán số tin sẽ gửi. Điều kiện cần lịch sử trước/sau hiển thị giải thích thay cho số dòng. Bootstrap, chạy lại không đổi dữ liệu, sửa kiểu ô và thay đổi phản chiếu không tạo thông báo bản ghi. Bản ghi còn conflict không gửi thông báo nghiệp vụ; cảnh báo conflict vẫn hoạt động riêng. Một cập nhật mới từ 8 xuống 7 vẫn gửi nếu điều kiện là tồn kho < 10; chưa có cơ chế chỉ báo lúc vượt ngưỡng.

Migration V11 thêm revision cho snapshot và tăng kích thước khóa nguồn outbox. Revision chỉ tăng khi dữ liệu checkpoint thay đổi. Khóa thông báo dùng flow, record và revision để chống tạo trùng qua nhiều execution; quay lại giá trị cũ sau một cập nhật khác là revision mới. Checkpoint, revision và outbox commit/rollback cùng giao dịch. Các lần ghi Sheet–Vault cũng dùng journal và đọc lại để verify trước khi lưu checkpoint hoặc xếp hàng thông báo; worker Telegram retry độc lập theo delivery status hiện có. Việc chống tạo trùng trong outbox không phải cam kết Telegram nhận đúng một lần nếu tiến trình chết sau khi nhà cung cấp đã nhận tin nhưng trước khi lưu trạng thái SENT.

## Lập lịch backend

Nối duy nhất một khối Hẹn giờ (`out`) vào cổng kích hoạt (`trigger`) của So khớp. Chọn chu kỳ 1–1440 phút hoặc giờ chạy hằng ngày; múi giờ mặc định là `Asia/Ho_Chi_Minh`. Chạy tay và xác nhận khởi tạo nguồn mới trước khi để lịch hoạt động. Chạy tay từ editor và chạy định kỳ dùng chung bộ tạo request, phạm vi cột và mã luồng. Với Sheet–Vault, thay đổi danh sách cột chia sẻ cũng tạo ngữ cảnh mới để không dùng nhầm checkpoint.

Lưu lại cấu hình không thay đổi lịch sẽ giữ nguyên thời điểm chạy kế tiếp. Backend kiểm tra mỗi 5 giây và ghi job vào PostgreSQL; lưu job và tiến lịch nằm trong cùng giao dịch. Khi backend ngừng lâu, chỉ tạo một lượt bù rồi tính lượt kế tiếp từ thời điểm hiện tại, không chạy dồn tất cả lượt đã lỡ. Khóa duy nhất ngăn tạo trùng một lượt; worker claim bằng `FOR UPDATE SKIP LOCKED` và lease 120 giây. Job giữ khóa hàng trong suốt giao dịch đồng bộ, nên lease hết hạn không cho worker khác chiếm job còn đang chạy. Khi tiến trình chết, PostgreSQL nhả khóa và job có thể được nhận lại sau khi lease hết hạn. Những luồng dùng chung nguồn vẫn chịu khóa phối hợp của bộ đồng bộ.

Tắt lịch hoặc đổi cấu hình sẽ hủy các job phiên bản cũ chưa bắt đầu; job đang chạy được phép hoàn tất. Lỗi tạm thời thử tối đa 3 lần, chờ 30 rồi 60 giây. Hết số lần thử chuyển `DEAD` và ngừng tạo lượt mới cho phiên bản đó; sửa cấu hình hoặc chạy tay thành công để tiếp tục. `NEEDS_BOOTSTRAP` yêu cầu chạy tay và xác nhận khởi tạo; `NEEDS_CONNECTION` yêu cầu kết nối lại Google rồi lưu cấu hình. Modal Hẹn giờ hiển thị trạng thái và thời điểm chạy gần nhất/kế tiếp. Google Sheets và Telegram không có giao dịch chung với PostgreSQL: phục hồi job không phải cam kết side effect bên ngoài xảy ra đúng một lần; cơ chế snapshot/nhật ký ghi hiện có tiếp tục đối soát các lần ghi chưa hoàn tất.

OAuth lưu token được mã hóa ở backend và chỉ đưa mã kết nối ngẫu nhiên về trình duyệt. Token được làm mới trước khi hết hạn; refresh token bị thu hồi yêu cầu kết nối lại thay vì retry vô hạn. Định nghĩa workflow và job không chứa access/refresh token. API bearer-token cũ vẫn nhận token trực tiếp cho caller hiện có.

**Nâng cấp từ V7:** migration V8 xóa token cũ trong định nghĩa/cột token vì chúng không có khả năng làm mới; cần kết nối lại Google và lưu workflow. Thời điểm lịch cũ được chuyển sang `TIMESTAMPTZ` với giả định trước đây backend chạy giờ Việt Nam; nếu triển khai cũ dùng múi giờ khác, điều chỉnh lịch trước khi bật scheduler. Không đổi hoặc xóa khóa mã hóa khi vẫn cần sử dụng các kết nối đã lưu.

Các lần ghi nhiều ô dùng [Google Sheets values.batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate) với [RAW](https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption). Google Sheets và PostgreSQL không có giao dịch phân tán: nếu Sheet ghi xong nhưng database lỗi sau đó, phiên được báo lỗi và cần chạy lại để đối soát; hệ thống không báo thành công trước khi cập nhật checkpoint.

## API chính

Editor tự tải lịch sử và xung đột mỗi giây khi tab đang hiển thị, tăng lên mỗi 500 ms khi một phiên đang chạy, đồng thời cập nhật ngay khi quay lại tab. Khi có kết quả đồng bộ mới, dữ liệu các nguồn được đọc lại; lịch sử không đổi không gây đọc Google Sheets lặp lại. Cơ chế theo dõi này chỉ đọc trạng thái, không kích hoạt thêm lượt đồng bộ.

Migration V9 bổ sung tiến trình từng bước vào lịch sử, được lưu bằng giao dịch riêng để giao diện đọc được khi phiên đồng bộ vẫn đang chạy. Khối đang thực hiện có viền xanh dương, biểu tượng xoay và nhãn bước; điểm sáng trên dây đi theo chiều đọc/ghi thực tế. Thành công giữ màu xanh, xung đột/chờ xác nhận giữ màu cam, lỗi giữ màu đỏ đến lượt kế tiếp. Nhánh chưa thực hiện không được đánh dấu thành công; timer chỉ tham gia khi backend ghi nhận kích hoạt theo lịch. Khi nhận một lượt vừa hoàn tất, các dây đã chạy sáng theo màu kết quả trong 2 giây, kèm nhãn xác nhận vừa hoàn tất; trạng thái vẫn là đã xong, không giả lập RUNNING. Hiệu ứng không phát lại lịch sử cũ khi mở trang và đợi tab hiển thị nếu kết quả đến lúc tab bị ẩn. Lịch sử cũ chưa có tiến trình chỉ hiện trạng thái tổng thể. Khi bật giảm chuyển động trong hệ điều hành, vẫn giữ chữ và màu trạng thái nhưng dừng chuyển động.

- `POST /api/v1/sync/run`: `flowId`, `accessToken`, `spreadsheetId`, `sheetName`, `idColumn`, `storageName`, `conflictPolicy`, `notifyConflicts`, `chatId` (khi bật thông báo), `bootstrapConfirmed`. Có thể truyền `syncColumns` để chọn cột.
- Kết quả gồm `executionId`, `status`, `bootstrapRequired`, `cleanRecordIds`, `conflicts`, `notificationsSent`, `notificationsFailed`, `totalRowsProcessed`, `comparedColumns`, `latency`.
- `GET /api/v1/conflicts?flowId=...`: chỉ xung đột đang mở của luồng.
- `POST /api/v1/conflicts/{id}/resolve`: `resolvedValue`, `accessToken`. Chỉ chấp nhận giá trị một trong hai bên của conflict hiện tại.
- `POST /api/v1/conflicts/{id}/notify`: `chatId`; trả `success` theo kết quả nhà cung cấp.
- `GET /api/v1/workflows/{flowId}/history`, `GET /api/v1/workflows/{flowId}/vault`.
- `GET/PUT /api/v1/workflows/{workflowId}/definition`: đọc/lưu `{nodes, edges}`.
- `POST /api/v1/workflows/{workflowId}/run?bootstrapConfirmed=false`: chạy định nghĩa đã lưu bằng kết nối Google do backend quản lý.
- `GET /api/v1/workflows/{workflowId}/schedule`: trạng thái lịch/job, lỗi đã lược bỏ chi tiết nhạy cảm và lần chạy gần nhất/kế tiếp.
- `GET /api/v1/connections/google/config`: origin callback OAuth để frontend xác minh thông điệp popup khi đi qua proxy.
- `POST /api/v1/connections/google/sheets/metadata`: `accessToken`, `spreadsheetId`; trả tên file cùng danh sách `{sheetId,title}` cho dropdown, không đọc dữ liệu các ô. Nguồn vẫn được đối soát theo tên tab hiện tại; đổi tên tab cần chọn/lưu lại và tạo ngữ cảnh mới.
- `GET /api/v1/connections/telegram/bot`: trạng thái/tên bot từ Telegram, không trả token.
- `POST /api/v1/connections/telegram/link`: `{recipientType: "PRIVATE"|"GROUP"}`; tạo liên kết xác nhận có hiệu lực 10 phút. `GET /api/v1/connections/telegram/link/{id}` kiểm tra kết quả, chỉ trả nơi nhận của đúng mã kết nối.
- `POST /api/v1/connections/telegram/recipient`: `{chatId,recipientType}` để kiểm tra nơi nhận nâng cao.
- `POST /api/v1/connections/telegram/test`: `{chatId,recipientType}` để gửi tin thử cố định, không cần conflict. Chỉ báo thành công khi Telegram xác nhận.

Kết nối Telegram tự động dùng deep link Start và đọc `getUpdates` khi modal đang chờ. Không xóa/đổi webhook, không gửi `offset` để xác nhận/xóa các tin khác, không đổi bộ lọc cập nhật của bot. Bot đang dùng webhook hoặc có bộ đọc updates khác nên dùng Chat ID nâng cao; hàng đợi dài hơn 100 tin cũng có thể khiến xác nhận mới chưa xuất hiện. Liên kết nằm trong bộ nhớ backend, hết hạn sau 10 phút hoặc khi backend khởi động lại. Hệ thống không gửi tin khi mở modal hoặc chỉ tạo liên kết; tin thử chỉ gửi khi người dùng bấm nút tương ứng.

Các conflict cũ thiếu thông tin nguồn không được phê duyệt mù; cần chạy lại với luồng mới. Chúng không bị xóa khỏi database.

## Kiểm thử

Quy ước backend: controller chỉ nhận tham số HTTP, gọi interface service và trả response/redirect. Package `service` chỉ chứa interface; các lớp nghiệp vụ nằm trong `service.impl` và triển khai interface tương ứng. SQL nằm ở repository; utility nằm trong `util`, JSON codec trong `support`, HTTP client trong `client`. `ExecutionHistoryServiceImpl` giữ transaction `REQUIRES_NEW` để lưu lịch sử độc lập với giao dịch đồng bộ. HTML callback OAuth nằm trong template và renderer riêng. Dùng kiểu tường minh và class DTO, không dùng `var` hoặc Java `record`. `ControllerArchitectureTest` và `ServiceArchitectureTest` kiểm tra các ranh giới này khi chạy test.

- Frontend: `npm test`, `npm run build` trong `frontend`.
- Backend: `mvn test` trong `backend`. Test Telegram dùng HTTP giả lập của Spring, không gửi tin thật.
- Kiểm thử API + PostgreSQL được bật khi `HYBRIDFLOW_TEST_DB_URL=jdbc:postgresql://127.0.0.1:15432/hybridflow_test`. Chỉ dùng database tạm, user/password `hybridflow_test`; test sẽ truncate các bảng ứng dụng trong database này. Tạo container riêng không mount volume: `docker run --rm --name hybridflow-sync-verify -d -e POSTGRES_DB=hybridflow_test -e POSTGRES_USER=hybridflow_test -e POSTGRES_PASSWORD=hybridflow_test -p 127.0.0.1:15432:5432 postgres:16-alpine`. Dừng container bằng `docker stop hybridflow-sync-verify` sau khi test.
- Trên môi trường hạn chế fork/attach của JVM, có thể dùng `mvn -DforkCount=0 test` với Byte Buddy agent được nạp sẵn bằng `MAVEN_OPTS=-javaagent:<đường-dẫn-byte-buddy-agent.jar>`.

Các test API kiểm tra Spring MVC/JPA/Flyway trên PostgreSQL thật; Google Sheets/OAuth/Telegram được thay ở biên dịch vụ, vì vậy vẫn cần kết nối tài khoản Google của bạn để xác minh end-to-end trên Sheet thật.

## Đồng bộ nhiều Google Sheet và an toàn khi ghi

Nối từ hai khối Google Trang Tính vào khối So khớp; bỏ khối Vault khỏi luồng nhiều Sheet. Trong khối So khớp, nhập cột khóa và **các cột được chia sẻ**, cách nhau bằng dấu phẩy. Danh sách này bắt buộc với luồng nhiều Sheet; hệ thống không tự chia sẻ tất cả cột trùng tên. Mọi cột được chọn phải có mặt trên tất cả các Sheet. Đây là cấu hình phạm vi chia sẻ, không phải cơ chế cấp quyền truy cập cho người dùng. Quyền đọc/ghi file vẫn phụ thuộc tài khoản Google được kết nối.

API nhiều Sheet nhận `sheets: [{nodeId,label,spreadsheetId,sheetName}, ...]` và `syncColumns`. Đổi danh sách cột chia sẻ tạo ngữ cảnh mới trên frontend và cần xác nhận khởi tạo; đổi nhãn/node ID không thay đổi nguồn dữ liệu. Chính sách ưu tiên nguồn/đích dùng thứ tự endpoints trong cấu hình, không dùng vị trí kéo thả trên canvas.

Dòng mới có mã chưa từng đồng bộ được sao chép sang các Sheet còn thiếu, chỉ ghi mã và các cột được phép. Nếu các bản sao của dòng mới đang khác nhau và chưa có dòng trên mọi Sheet, luồng dừng để người dùng thống nhất giá trị trước. Không tự lan truyền xóa dòng: nếu dòng đã có snapshot bị thiếu trên một Sheet, cần khôi phục dòng. Khi Sheet hết số dòng được cấp sẵn, cần thêm dòng trống trên Google Sheets rồi chạy lại.

Conflict mới lưu giá trị quan sát riêng theo định danh file/tab, nên các Sheet trùng tên vẫn giữ đủ lựa chọn. Phê duyệt đọc và kiểm tra tất cả nguồn trước khi ghi; dữ liệu thay đổi, thiếu dòng hoặc mất cột sẽ bị từ chối. Conflict cũ chưa lưu giá trị từng nguồn cần chạy lại đồng bộ. Khi các Sheet đã thống nhất, conflict cũ chuyển `SUPERSEDED` và không còn trong danh sách đang mở. Chạy lại cùng conflict đang mở không gửi lặp cảnh báo tự động; nút gửi lại vẫn là thao tác chủ động.

Khóa database theo file (theo thứ tự cố định) ngăn các luồng HybridFlow cùng ghi chồng lên một Sheet. Khóa này không khóa thao tác chỉnh sửa của người dùng trên Google Sheets. Đọc kiểm tra rồi ghi qua Google API vẫn có khoảng thời gian giữa hai thao tác, nên không cam kết chống mọi chỉnh sửa đồng thời hay giao dịch nguyên tử giữa nhiều file.

Mỗi đợt ghi nhiều Sheet lưu một intent bền vững vào `sheet_write_journal` trước khi gọi Google, không lưu access token. Trạng thái hoàn tất commit cùng transaction snapshot/conflict. Khi transaction rollback, hệ thống thử khôi phục các ô đã ghi; intent chưa phục hồi được giữ `PENDING`. Lần chạy tiếp phải đối soát/khôi phục intent trước khi tạo kế hoạch mới, kể cả sau khi tiến trình khởi động lại. Nếu có chỉnh sửa mới hoặc dòng đổi vị trí, hệ thống dừng thay vì khôi phục đè lên dữ liệu đó. Luồng khác có chung file cũng bị chặn; chạy lại luồng gốc có đủ các file liên quan để đối soát. Không xóa intent `PENDING` để bỏ qua lỗi.

### Nhận diện nguồn và trạng thái đọc trên giao diện

Mỗi khối Sheet hiển thị riêng tên file thật, tên trang tính và số thứ tự nguồn. ID file nằm trong phần Chi tiết nguồn. Trạng thái đọc được lưu riêng theo khối/file/tab: Chưa đọc, Đang đọc, Đã đọc X dòng hoặc Đọc thất bại kèm lý do. Đọc lỗi không giữ bảng cũ ở trạng thái có thể sửa và không dùng dấu tích xanh. Đổi file/tab không lấy trạng thái của nguồn khác.

Nút Xem bảng tính có bộ chọn nguồn; nút Xem dữ liệu trên từng khối mở thẳng nguồn đó. Làm mới và sửa ô chỉ áp dụng cho file/tab đang chọn. Preview trong cấu hình dùng cùng trạng thái đọc theo nguồn; xem thử file/tab khác không đổi cấu hình đã lưu. Sau đồng bộ hoặc duyệt conflict, ứng dụng đọc lại từng nguồn để cập nhật trạng thái. Popup conflict mới hiển thị tên file, trang tính và giá trị thành các thẻ riêng, nút chọn dùng nhãn nguồn ngắn; dữ liệu conflict cũ còn giữ trong phần chi tiết.

Khối So khớp có hai cổng Sheet cùng tham gia đồng bộ hai chiều (trái màu tím, phải màu xanh ngọc) và cổng Cảnh báo xung đột màu cam để nối Telegram. Bấm “Đã nối X trang tính” để xem tên file → trang tính của các khối đã nối; khối chưa cấu hình được báo riêng. Luồng Sheet–Vault cũ hiển thị “Kho lưu trữ” ở cổng bên phải. Các định danh cổng và luồng đã lưu vẫn tương thích.

## Kiểu cột khi ghi Google Sheets

Trong khối **Điều phối & Đồng bộ**, mở phần **2. Giữ những cột nào giống nhau?**, chọn cột và kiểu dữ liệu trên cùng một hàng: chọn **Số** cho `price`/số lượng, giữ **Văn bản** cho mã và số điện thoại. Cột khóa luôn là Văn bản. Mặc định không tự đoán chuỗi chữ số thành số.

Cấu hình lưu ở `columnTypes`, ví dụ `{"price":"NUMBER","phone":"TEXT"}`. Ghi vẫn dùng RAW: chỉ ô thuộc cột NUMBER được gửi thành JSON number, các ô khác là chuỗi. Giá trị NUMBER dùng dấu chấm thập phân, không chứa dấu phân cách hàng nghìn; ô trống vẫn được xóa bình thường. Dữ liệu không hợp lệ hoặc vượt độ chính xác 15 chữ số bị từ chối trước khi ghi.

Đổi kiểu cột tạo flowId mới để không dùng nhầm snapshot; chạy tay và xác nhận khởi tạo trước khi tiếp tục lịch. Khi đồng bộ, các ô còn lưu dạng văn bản trong cột NUMBER được sửa cả khi giá trị hiển thị không đổi. Sửa kiểu ô không tự phát sự kiện bản ghi. Sửa ô trực tiếp trong bảng xem dữ liệu và duyệt xung đột cũng áp dụng kiểu đã chọn. Nhật ký phục hồi giữ kiểu và giá trị gốc của ô để rollback đúng.

## Xử lý lỗi thống nhất

Xem [hợp đồng xử lý lỗi](ERROR_HANDLING.md) cho mã lỗi, HTTP status, correlation ID, OAuth callback và chính sách retry của worker/outbox. Migration V12 bổ sung metadata lỗi vào lịch sử/job/outbox; khởi động lại backend để Flyway áp dụng trước khi dùng phiên bản này. Frontend tiếp tục đọc được trường `message` và hiển thị mã tra cứu khi có.
