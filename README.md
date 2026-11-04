# HybridFlow

Ứng dụng đồng bộ Google Sheets hai chiều theo bản ghi/cột, phát hiện xung đột và tự động gửi Telegram. Backend Spring Boot/Java 21, frontend React/Vite, database PostgreSQL.

## Chạy cục bộ

Yêu cầu JDK 21, Maven, Node.js và PostgreSQL. Từ gốc repo:

```powershell
docker compose up -d postgres
```

Cấu hình môi trường hoặc `backend/application-local.properties` (không commit secret):

- `DB_URL`, `DB_USER`, `DB_PASSWORD`: PostgreSQL; mặc định database `hybridflow` tại localhost:5432.
- `GOOGLE_LOGIN_CLIENT_ID`, `GOOGLE_LOGIN_CLIENT_SECRET`: Google Login/OIDC.
- `APP_LOGIN_CALLBACK`: mặc định `http://localhost:3000/login/oauth2/code/google`.
- `GOOGLE_WORKSPACE_REDIRECT_URI`: callback cấp quyền Sheets cho workspace, mặc định `http://localhost:8080/api/v1/workspaces/connections/google/callback`; đăng ký chính xác URI này trong Google Cloud.
- `GOOGLE_CREDENTIAL_ENCRYPTION_KEY`: Base64 của 32 byte ngẫu nhiên; giữ ổn định khi còn connection đã lưu.
- `FRONTEND_ORIGIN`: mặc định `http://localhost:3000`.
- `SCHEDULER_ENABLED`, `SCHEDULER_WORKERS`: mặc định true và 5. Tắt scheduler trong lúc chuyển dữ liệu sang workspace.
- `SESSION_COOKIE_SECURE`: true khi production dùng HTTPS.

Google Sheets OAuth đọc `backend/src/main/resources/client_secret.json` (được Git bỏ qua). Chọn connection Google cho nguồn Sheet và bot Telegram cho từng khối gửi tin trong workspace. Editor dùng connection được cấp quyền; Viewer không được sửa Sheet hoặc gửi tin thử. Hiện các nguồn Sheet trong một workflow cần dùng cùng một connection Google.

Mở hai terminal:

```powershell
# Terminal 1
cd backend
mvn spring-boot:run
```

```powershell
# Terminal 2
cd frontend
npm install
npm run dev
```

Mở `http://localhost:3000`. Vite proxy API/OAuth sang backend:8080. Đăng nhập → chọn workspace/module/workflow. Flyway tự áp dụng migration khi khởi động; schema hiện đến V16. Không sửa migration đã áp dụng.

## Kiểm thử

- Trong `frontend`: `npm test`, `npm run build`.
- Trong `backend`: `mvn test` với JDK 21.
- Để chạy integration test, cần PostgreSQL kiểm thử riêng; xem hướng dẫn vận hành. Không dùng database ứng dụng thật.

## Tài liệu

- [Vận hành, an toàn dữ liệu và kiểm thử](docs/VAN_HANH.md).
- [Phạm vi và các việc còn lại của Chặng 2](docs/CHANG_2.md).
- [Hợp đồng xử lý lỗi](ERROR_HANDLING.md).
- [SRS](HybridFlow_SRS_clean.txt).

Chặng 2 đang được tích hợp; chưa coi việc đăng nhập hoặc build thành công là đã nghiệm thu toàn bộ multi-tenant. Webhook, template và khối ghi Sheet độc lập chưa nằm trong đợt này.
