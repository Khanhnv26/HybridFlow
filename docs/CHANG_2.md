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
- API cũ `/workflows`, `/sync`, `/conflicts`, `/sync-conflicts`, `/notifications` không có workspace bị chặn ở Security Filter. Không mở lại để sửa lỗi giao diện.
- Chỉ đổi/xóa migration chưa áp dụng. Nâng schema đã dùng cần migration mới.

## API đang dùng

Tiền tố `/api/v1`:

```text
GET/POST   /workspaces
GET/POST   /workspaces/{w}/modules
GET/POST   /workspaces/{w}/workflows
GET/PUT    /workspaces/{w}/workflows/{f}
POST       /workspaces/{w}/workflows/{f}/run?bootstrapConfirmed=false
GET/DELETE /workspaces/{w}/workflows/{f}/history
GET        /workspaces/{w}/workflows/{f}/conflicts
GET        /workspaces/{w}/workflows/{f}/contexts/{c}/vault
GET        /workspaces/{w}/workflows/{f}/contexts/{c}/notifications?executionId=...&offset=0
POST       /workspaces/{w}/workflows/{f}/contexts/{c}/notifications/{n}/retry
POST       /workspaces/{w}/workflows/{f}/contexts/{c}/conflicts/{id}/resolve
```

Lưu workflow gửi `expectedVersion`, `definition`, `connectionBindings`. Version cũ trả 409; không tự ghi đè. Binding chỉ tham chiếu connection trong cùng workspace.

## Những việc còn phải hoàn thiện trước khi đóng chặng

1. Hoàn tất UI quản lý connection theo workspace và chuyển các thao tác preview/Google/Telegram còn dùng luồng kết nối cũ sang connection đã phân quyền. Không coi có màn hình đăng nhập là đã hoàn thành multi-tenant.
2. Thống nhất quyền Editor tạo workflow, quyền xử lý conflict và quyền dùng connection; kiểm thử cả thiếu grant và thu hồi grant.
3. Kiểm thử quota workspace dưới tải cạnh tranh; COUNT trước claim chưa đủ chống hai worker nhận vượt quota. Hoàn thiện rate limit theo connector.
4. Kiểm kê dữ liệu cũ, lập mapping workspace/workflow/context/connection, reconcile journal PENDING, rồi mới thêm NOT NULL/FK bằng migration tiếp theo. Không tự gán mọi dữ liệu cho người đầu tiên đăng nhập.
5. Kiểm tra module tắt, phiên bản cấu hình, job đang chờ/đang chạy, connection revoke và callback OAuth thật.

## Nghiệm thu

Hai tài khoản ở hai workspace: thử thay workspace/workflow/context/execution/conflict/notification/connection ID; mọi đọc/ghi ngoài quyền phải bị từ chối. Kiểm thử PostgreSQL cho create → read → update → list workflow, không chỉ mock repository. Giữ các kiểm thử checkpoint, journal, Outbox, lease và chạy song song của lõi đồng bộ.

Kiểm tra ngày 04/11/2026: 311 test backend đạt trên PostgreSQL tạm, 0 skipped; 139 test frontend đạt và production build thành công. Hai lỗi API legacy vượt quyền và query workflow sai cột đã có kiểm thử hồi quy. Google/Telegram được giả lập trong kiểm thử tự động.

Lệnh chạy và quy tắc vận hành xem [README](../README.md) và [Vận hành](VAN_HANH.md). SRS trong thư mục gốc là tài liệu yêu cầu; trạng thái ở đây không thay thế nghiệm thu SRS.
