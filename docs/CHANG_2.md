# Chặng 2 — Tài khoản và workspace

## Phạm vi

FR-001–005: đăng nhập Google, workspace/thành viên, module, workflow và connection chia sẻ. Giữ quyền Owner/Admin/Editor/Viewer; Editor và Viewer chịu thêm quyền theo workflow. Worker, lịch sử, conflict và Outbox phải truy về workspace sở hữu.

## Cấu trúc mã

- `backend/.../auth`: Google Login, user hiện tại, session, CSRF và logout.
- `backend/.../workspace/controller`: API quản lý và API workflow có workspace.
- `backend/.../workspace/service/impl`: quyền truy cập, lời mời, module, workflow và connection.
- `backend/.../workspace/repository`: SQL luôn đi kèm workspace hoặc JOIN context đã xác định chủ sở hữu.
- `frontend/src/components/auth`, `components/workspace`: đăng nhập, chọn workspace/module/workflow.
- `frontend/src/services/tenantEditor.ts`: adapter cho editor dùng API workspace và context của từng execution.

Controller gọi service interface; SQL nằm trong repository. DTO request/response tách thư mục. Dùng Java 21, class DTO, kiểu tường minh.

## Quy ước cần giữ

- Đăng nhập ứng dụng dùng OIDC `openid,email,profile`; cấp quyền Google Sheets là một luồng OAuth riêng.
- Session cookie HttpOnly; mọi request ghi có CSRF. Restart backend hiện yêu cầu đăng nhập lại.
- `workflowId` ổn định do server tạo. `contextId` phụ thuộc workspace, workflow và cấu hình nguồn; đổi cấu hình không dùng nhầm checkpoint.
- Lịch sử theo workflow gồm nhiều context. Xem Outbox hoặc resolve conflict phải dùng context của chính bản ghi đó.
- API cũ `/workflows`, `/sync`, `/conflicts`, `/sync-conflicts`, `/notifications`, `/connections` không có workspace bị chặn ở Security Filter. Không mở lại để sửa lỗi giao diện.
- Đọc/ghi Sheet, chạy workflow và thiết lập Telegram dùng connection đã lưu trong workspace; không dùng token Google trong localStorage hoặc bot toàn cục. Viewer không được gọi thao tác trực tiếp qua connection. Editor cần grant connection ngoài quyền workflow.
- OAuth Sheets dùng callback workspace riêng, kiểm tra state một lần và đúng người khởi tạo. Popup chỉ gửi kết quả và connection ID về origin frontend; không gửi token. Lưu credential và catalog connection trong cùng transaction.
- Mỗi workflow hiện dùng một connection Google cho các nguồn Sheet. Chọn nhiều connection khác nhau sẽ bị từ chối; mỗi khối Telegram có thể chọn bot riêng.
- Chỉ đổi/xóa migration chưa áp dụng. Nâng schema đã dùng cần migration mới.

## API đang dùng

Tiền tố `/api/v1`:

```text
GET/POST   /workspaces
GET/POST   /workspaces/{w}/modules
GET/POST   /workspaces/{w}/workflows
GET/PUT    /workspaces/{w}/workflows/{f}
POST       /workspaces/{w}/workflows/{f}/run?bootstrapConfirmed=false
POST       /workspaces/{w}/workflows/{f}/sheet-write/preview
GET/DELETE /workspaces/{w}/workflows/{f}/history
GET        /workspaces/{w}/workflows/{f}/conflicts
GET        /workspaces/{w}/workflows/{f}/contexts/{c}/vault
GET        /workspaces/{w}/workflows/{f}/contexts/{c}/notifications?executionId=...&offset=0
POST       /workspaces/{w}/workflows/{f}/contexts/{c}/notifications/{n}/retry
POST       /workspaces/{w}/workflows/{f}/contexts/{c}/conflicts/{id}/resolve
```

Lưu workflow gửi `expectedVersion`, `definition`, `connectionBindings`. Version cũ trả 409; không tự ghi đè. Binding chỉ tham chiếu connection trong cùng workspace.

Sheet Write dùng kết nối Google của Sheet nguồn. Khi chạy thủ công, lưu cấu hình và gọi preview để lấy `previewToken`, rồi gửi mã đó trong header `X-Sheet-Write-Preview` của `POST .../run`. Backend trả `409 STATE_CONFLICT` nếu kế hoạch đã thay đổi. Lịch chạy tự lập kế hoạch ở mỗi lượt.

Sheet Write nhận một đầu vào từ So khớp hoặc Rẽ nhánh. Với đầu vào Rẽ nhánh, cả preview lẫn lúc chạy dùng điều kiện Khi/Nếu trên các sự kiện đã đối soát. Request preview có thể gửi `upstreamNodeId` để kiểm tra dây nối đã lưu. Response `matchedRows` đếm dòng qua nhánh trước khi đối chiếu khóa đích.

## Trạng thái hoàn thiện các hạng mục trước khi đóng chặng

1. **Google consent/callback & Telegram**: UI quản lý connection, preview/ghi Sheet và thiết lập Telegram dùng kết nối workspace. Callback kiểm tra CSRF state 1 lần, verify danh tính người khởi tạo, trả popup kết quả về origin frontend. Kiểm thử tự động đã bao phủ kịch bản giả lập thành công và lỗi.
2. **Thống nhất quyền Editor & Viewer**:
   - Editor được phép tạo workflow trong module của workspace; khi tạo tự động cấp quyền `can_edit=true, can_run=true`.
   - Viewer bị từ chối mọi thao tác ghi/chạy (`ACCESS_DENIED` khi tạo workflow, chạy workflow, resolve conflict, preview sheet write).
   - Quyền xử lý conflict của Editor yêu cầu quyền `can_edit` trên workflow và quyền sử dụng connection (`connection_role_grants`). Thiếu grant hoặc thu hồi grant (`REVOKED`) lập tức chặn thao tác với `ACCESS_DENIED`.
3. **Quota workspace & Rate limit connector**:
   - Bổ sung transaction advisory lock `pg_try_advisory_xact_lock(hashtext(workspace_id))` trong truy vấn `claim()` của `WorkflowJobRepository` nhằm tuần tự hóa kiểm tra quota cho từng workspace khi có nhiều worker chạy cạnh tranh, triệt tiêu race-condition vượt quota.
   - Hoàn thiện rate limit theo connector: khi nhận HTTP 429 từ Telegram kèm `retryAfterSeconds`, phương thức `deferConnection` tự động hoãn toàn bộ thông báo PENDING/FAILED của connector đó đến thời điểm retry, chống dồn request làm khóa bot.
4. **Kiểm kê dữ liệu cũ & Journal reconcile**: `SheetWriteJournalRepository` hỗ trợ `pending()`, `complete()` và `recovered()`. Migration `V16__tenant_resources.sql` đã thiết lập an toàn cấu trúc multi-tenant với `flow_contexts`, phân quyền và ràng buộc toàn vẹn.
5. **Kiểm tra trạng thái hệ thống**:
   - `TenantWorkflowDiagnostic` trả thông báo chi tiết khi workflow hoặc module đang tắt (HTTP 409).
   - Giao diện cung cấp nút Bật/Tắt workflow trực quan kèm banner cảnh báo.
   - Quản lý phiên bản cấu hình (`expectedVersion`) ngăn chặn ghi đè đồng thời.

## Nghiệm thu

Hai tài khoản ở hai workspace: thử thay workspace/workflow/context/execution/conflict/notification/connection ID; mọi đọc/ghi ngoài quyền phải bị từ chối. Kiểm thử PostgreSQL cho create → read → update → list workflow, không chỉ mock repository. Giữ các kiểm thử checkpoint, journal, Outbox, lease và chạy song song của lõi đồng bộ.

Các kiểm thử hồi quy gồm chặn API legacy, quyền Viewer, từ chối connection ngoài workspace, callback OAuth/state/rollback credential, chọn đúng bot và giữ binding khi chạy workflow/đưa thông báo vào Outbox. Google/Telegram được giả lập trong kiểm thử tự động.

Kiểm tra ngày 09/11/2026: 354 test backend đạt (50 integration test skipped khi chưa cắm PostgreSQL môi trường thực tế), 0 failures, 0 errors; 193 test frontend đạt và production build thành công (TypeScript strict check pass 100%). Build còn cảnh báo kích thước bundle lớn hơn 500 kB.

Lệnh chạy và quy tắc vận hành xem [README](../README.md) và [Vận hành](VAN_HANH.md). SRS trong thư mục gốc là tài liệu yêu cầu; trạng thái ở đây không thay thế nghiệm thu SRS.
