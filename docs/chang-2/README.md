# Chặng 2: hướng dẫn tự code cho fresher

Tài liệu dành riêng cho HybridFlow, đối chiếu mã nguồn ngày 04/11/2026. Đây là kế hoạch và code tham khảo để bạn tự triển khai; các đoạn Java/SQL/TS trong tài liệu chưa được đưa vào ứng dụng. Không copy tất cả cùng lúc. Hoàn thành từng bài và chạy kiểm tra trước khi sang bài tiếp theo.

## 1. Bạn sẽ xây được gì?

Người dùng đăng nhập Google → chọn workspace → mở module Bán hàng/Kho → tạo/chạy workflow được cấp quyền → dùng connection của workspace → xem lịch sử, conflict và Outbox của đúng workspace.

Phạm vi SRS: FR-001, FR-002, FR-003, FR-004, FR-005; bổ sung phạm vi workspace cho FR-018/019/020. Webhook, template và `sheetWriteAction` độc lập để sau.

## 2. Đọc theo thứ tự

1. [Bài 1–2: đăng nhập và session](01-dang-nhap.md).
2. [Bài 3–5: workspace, phân quyền, module, lời mời](02-workspace.md).
3. [Bài 6–9: ghép workflow/connection/worker hiện có vào workspace](03-tich-hop.md).
4. [Bài 10: frontend và nghiệm thu](04-frontend-va-kiem-thu.md).

Các block có **File đầy đủ** chứa package/import/class để bạn tạo đúng file. Các block có **Đoạn ghép** cần đặt vào lớp sẵn có và bổ sung import. Các phần **Bài tự làm** là công việc bắt buộc còn phải thực hiện, không phải phần code đã hoàn chỉnh.

## 3. Quyết định thiết kế để bạn ít bị rối

- Giữ Java 21 và Spring Boot 3.3.5 của repo trong nhánh học này; không đồng thời nâng framework. Trước phát hành thật, dành một đầu việc riêng nâng bản framework được hỗ trợ và kiểm tra tương thích.
- Dùng Spring Security OAuth2 Login/OIDC và HttpSession. Cookie `JSESSIONID` do backend quản lý. Đăng xuất hủy session; timeout 30 phút không hoạt động. Bản đầu một backend dùng session trong bộ nhớ; restart backend yêu cầu đăng nhập lại. Job/snapshot/connection vẫn lưu PostgreSQL như hiện tại.
- Đăng nhập Google chỉ xin `openid,email,profile`. Kết nối Google Sheets là bước cấp quyền riêng, giữ mã hóa token hiện có.
- Giữ CSRF bật. Frontend lấy token qua API rồi gửi header trong POST/PUT/PATCH/DELETE.
- Dùng `JdbcTemplate`, DTO class và service interface → implementation. Đây là cấu trúc repo đã có; không học thêm một kiểu persistence khác trong cùng bài.
- ID do server tạo. `workspaceId` trong URL là tài nguyên cần kiểm tra quyền, không phải bằng chứng người dùng thuộc workspace đó.
- Single-owner cho phiên bản đầu: mỗi workspace có một Owner; chưa xây chuyển Owner/xóa tài khoản Owner. Admin quản lý module/workflow/connection; Owner quản lý thành viên. Đây là quyết định sản phẩm cần ghi lại, có thể mở rộng sau.
- Editor chỉ thao tác workflow được cấp quyền. Viewer chỉ đọc workflow được cấp quyền. Việc ẩn nút ở React không thay thế kiểm tra backend.
- Module/workflow tắt: không nhận trigger mới; job đang chạy được hoàn tất an toàn. Retry cho side effect đã xác minh được xử lý theo chính sách riêng trong bài tích hợp.

Session giúp giảm lượng code bạn phải tự duy trì. Spring Security đã có các điểm mở rộng cho OAuth2 Login và cơ chế CSRF; tham khảo [OAuth2 Login](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/advanced.html) và [CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html). Tài liệu online hiện có thể hiển thị phiên bản mới hơn repo; ví dụ ở đây dùng API đã có trong Spring Security 6.

## 4. Lịch học đề xuất

Ước lượng để tự học: 5–8 tuần nếu dành khoảng 10–15 giờ/tuần; điều chỉnh theo thời gian xử lý lỗi. Đừng lấy số ngày này làm cam kết giao hàng.

- Tuần 1: bài 1–2, dependency, đăng nhập, `/auth/me`, CSRF, logout.
- Tuần 2: bài 3, database workspace, tạo/liệt kê workspace, test A/B.
- Tuần 3: bài 4–5, role, workflow grants, module, lời mời và audit.
- Tuần 4–5: bài 6–7, workflow ổn định, flow context, chuyển các API sync/history/conflict/Outbox.
- Tuần 6: bài 8–9, connection theo workspace, OAuth state, worker và quota.
- Tuần 7–8: bài 10, frontend, migration dữ liệu cũ và toàn bộ nghiệm thu.

Mỗi phiên học: đọc mục tiêu → viết một đường đi nhỏ → gọi API bằng curl/Postman → thêm test cho trường hợp vượt quyền → commit. Trước khi bắt đầu, lưu riêng các thay đổi Chặng 1 đang có; đừng dùng `git reset --hard` để tạo điểm xuất phát.

## 5. Cấu trúc package

```text
backend/src/main/java/com/hybridflow/
  auth/
    controller/AuthController.java
    dto/MeResponse.java, CsrfResponse.java
    repository/AccountRepository.java
    security/GoogleOidcUserLoader.java, SecurityErrorWriter.java
    service/AccountService.java, CurrentUserService.java, AuthService.java
    service/impl/AccountServiceImpl.java, CurrentUserServiceImpl.java, AuthServiceImpl.java
  workspace/
    controller/WorkspaceController.java
    dto/CreateWorkspaceRequest.java, WorkspaceResponse.java
    model/WorkspaceRole.java
    repository/WorkspaceRepository.java, MembershipRepository.java
    service/WorkspaceService.java, WorkspaceAccessService.java
    service/impl/WorkspaceServiceImpl.java, WorkspaceAccessServiceImpl.java
  module/...
  common/config/SecurityConfig.java
```

Một public class/interface một file. Tên `service` chỉ chứa interface; SQL ở repository; controller chỉ gọi service. Không dùng Java `record` hoặc `var`, theo README và architecture tests hiện tại.

## 6. Hợp đồng API cần chốt trước khi viết giao diện

Mọi đường dẫn dưới đây bắt đầu bằng `/api/v1`.

```text
GET    /auth/csrf                                      public, cấp CSRF token
GET    /auth/me                                        đã đăng nhập
POST   /auth/logout                                    đã đăng nhập + CSRF
GET    /auth/login/google                              redirect đăng nhập

GET    /workspaces                                    workspace của tôi
POST   /workspaces                                    tạo workspace, tôi thành Owner
PATCH  /workspaces/{w}                                 Owner
GET    /workspaces/{w}/members                          thành viên
PATCH  /workspaces/{w}/members/{u}                      Owner, không đổi Owner
DELETE /workspaces/{w}/members/{u}                      Owner, không xóa Owner
POST   /workspaces/{w}/invitations                      Owner, không mời vai trò Owner
DELETE /workspaces/{w}/invitations/{i}                  Owner, thu hồi lời mời
POST   /invitations/accept                             tài khoản đúng email đã xác minh

GET    /workspaces/{w}/modules                         danh sách + thống kê trong phạm vi được phép
POST   /workspaces/{w}/modules                         Owner/Admin
PATCH  /workspaces/{w}/modules/{m}                     Owner/Admin
GET    /workspaces/{w}/modules/{m}/workflows            đọc theo role/grant
POST   /workspaces/{w}/modules/{m}/workflows            Owner/Admin, Editor theo chính sách bên dưới
GET    /workspaces/{w}/workflows/{f}/definition         đọc theo role/grant
PUT    /workspaces/{w}/workflows/{f}/definition         sửa theo role/grant + expectedVersion
POST   /workspaces/{w}/workflows/{f}/duplicate          người có quyền tạo + đọc bản gốc
PATCH  /workspaces/{w}/workflows/{f}                   sửa tên/bật-tắt theo quyền
PUT    /workspaces/{w}/workflows/{f}/grants/{u}         Owner/Admin
POST   /workspaces/{w}/workflows/{f}/run                chạy theo role/grant
GET    /workspaces/{w}/workflows/{f}/history            đọc theo role/grant
GET    /workspaces/{w}/workflows/{f}/contexts/{c}/notifications
POST   /workspaces/{w}/workflows/{f}/notifications/{n}/retry
GET    /workspaces/{w}/workflows/{f}/contexts/{c}/conflicts
POST   /workspaces/{w}/workflows/{f}/conflicts/{id}/resolve

GET    /workspaces/{w}/connections                     thành viên, DTO không chứa secret
GET    /workspaces/{w}/connections/{id}/usage           Owner/Admin, workflow bị ảnh hưởng
POST   /workspaces/{w}/connections/google/start         Owner/Admin, session + CSRF
POST   /workspaces/{w}/connections/telegram             Owner/Admin
DELETE /workspaces/{w}/connections/{id}                Owner/Admin, từ chối khi còn được dùng
```

API tạo workflow: Editor được tạo trong module đang bật của workspace, server tự cấp READ/EDIT/RUN cho người tạo; Owner/Admin nhìn và quản lý toàn bộ. Viewer không tạo. Đây là chính sách mẫu rõ ràng để bạn triển khai, không phải hành vi sẵn có.

Quy ước lỗi: `401` chưa đăng nhập/hết session; `403` không có role/quyền thao tác; `404` ID không thuộc workspace/workflow đang mở; `409` phiên bản cũ/connection đang được dùng; `400` đầu vào sai. Giữ format `ApiError` hiện có, kể cả lỗi phát sinh từ Security Filter.

## 7. Khi nào được gọi là xong Chặng 2?

- Người chưa đăng nhập không mở API nghiệp vụ; logout/session hết hạn bị từ chối.
- Hai tài khoản ở hai workspace: đổi mọi ID trong request không đọc/ghi/retry/resolve tài nguyên của nhau.
- Editor/Viewer bị giới hạn theo workflow grant; role bị thu hồi có hiệu lực ở request kế tiếp.
- Module tắt không tạo job mới, không chạy tay mới; job đang chạy kết thúc theo chính sách đã chọn.
- Tạo/nhân bản/bật-tắt workflow và lưu cấu hình có kiểm tra phiên bản.
- Google/Telegram connection tái sử dụng trong workspace, có quyền dùng và báo tác động trước khi đổi/xóa.
- Job/Outbox/trace có workspace, không lấy quyền từ localStorage hoặc HTTP session trong worker.
- Mời thành viên đúng email, token hết hạn/thu hồi/dùng lại bị chặn; audit các thao tác quản trị.
- Dữ liệu cũ được gán chủ sở hữu qua bước migration có kiểm chứng; không có endpoint cũ vượt qua tenant guard.
- Test Chặng 1 vẫn xanh và có test mới cho isolation/RBAC/CSRF.

Đừng đánh dấu cả chặng hoàn thành ngay sau khi màn hình đăng nhập chạy được. Phần khó nhất là ghép quyền vào toàn bộ đường đọc/ghi hiện có.
