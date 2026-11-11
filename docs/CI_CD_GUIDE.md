# Hướng dẫn thiết lập CI/CD Production 0 Đồng (HybridFlow)

## 1. Thiết lập Database PostgreSQL miễn phí (Neon.tech)

1. Đăng ký tài khoản miễn phí tại [neon.tech](https://neon.tech).
2. Tạo project mới (ví dụ: `hybridflow-prod`).
3. Sao chép chuỗi kết nối PostgreSQL (Connection string), định dạng:
   `postgresql://[user]:[password]@[host]/[dbname]?sslmode=require`
4. Chuyển đổi định dạng cho JDBC của Spring Boot:
   `jdbc:postgresql://[host]/[dbname]?sslmode=require`

---

## 2. Thiết lập Backend trên Render (Web Service Free)

1. Đăng ký tài khoản tại [render.com](https://render.com).
2. Nhấn **New +** → **Web Service** → Chọn repository `Khanhnv26/HybridFlow`.
3. Cấu hình cơ bản:
   - **Name**: `hybridflow-backend` (hoặc tên tuỳ chọn).
   - **Root Directory**: `backend`.
   - **Runtime**: `Docker`.
   - **Instance Type**: `Free`.
   - **Auto-Deploy**: Chọn **No** (Để GitHub Actions kiểm soát việc deploy sau khi test pass).
4. Cấu hình Environment Variables trên Render:
   - `DB_URL`: JDBC URL từ Neon (ví dụ: `jdbc:postgresql://ep-xxx.neon.tech/neondb?sslmode=require`).
   - `DB_USER`: Username từ Neon.
   - `DB_PASSWORD`: Password từ Neon.
   - `GOOGLE_LOGIN_CLIENT_ID`: Client ID từ Google Cloud Console.
   - `GOOGLE_LOGIN_CLIENT_SECRET`: Client Secret từ Google Cloud Console.
   - `GOOGLE_CREDENTIAL_ENCRYPTION_KEY`: Chuỗi Base64 32 byte bí mật.
   - `FRONTEND_ORIGIN`: URL Vercel của bạn (ví dụ: `https://hybridflow.vercel.app`).
   - `APP_LOGIN_CALLBACK`: `https://hybridflow.vercel.app/login/oauth2/code/google`.
   - `GOOGLE_WORKSPACE_REDIRECT_URI`: `https://hybridflow.vercel.app/api/v1/workspaces/connections/google/callback`.
   - `SESSION_COOKIE_SECURE`: `true`.
   - `SCHEDULER_ENABLED`: `true`.
   - `SCHEDULER_WORKERS`: `3`.
5. Lấy **Deploy Hook**:
   - Vào mục **Settings** của Web Service → Cuộn xuống **Deploy Hook** → Sao chép URL deploy hook.

---

## 3. Cập nhật URL Backend vào Frontend (`frontend/vercel.json`)

Mở tệp `frontend/vercel.json` và cập nhật các dòng `destination` trỏ về đúng tên miền Render của bạn:

```json
{
  "source": "/api/(.*)",
  "destination": "https://[ten-backend-cua-ban].onrender.com/api/$1"
}
```

---

## 4. Thiết lập GitHub Secrets

Vào repository trên GitHub → **Settings** → **Secrets and variables** → **Actions** → Thêm các secret sau:

| Tên Secret | Giá trị |
| :--- | :--- |
| `RENDER_DEPLOY_HOOK` | URL deploy hook lấy từ Render ở Bước 2. |
| `VERCEL_TOKEN` | Token tạo tại [vercel.com/account/tokens](https://vercel.com/account/tokens). |
| `VERCEL_ORG_ID` | Lấy từ file `frontend/.vercel/project.json` sau khi chạy `npx vercel link` hoặc từ Project Settings trên Vercel. |
| `VERCEL_PROJECT_ID` | Lấy từ Project Settings trên Vercel. |
| `TELEGRAM_BOT_TOKEN` | Token Bot Telegram nhận thông báo. |
| `TELEGRAM_CHAT_ID` | ID nhóm/kênh hoặc chat cá nhân nhận thông báo. |

---

## 5. Giữ Backend hoạt động 24/7 (UptimeRobot 0đ)

Vì Render Free tier sẽ tự động tạm dừng (sleep) sau 15 phút không có lượt truy cập, cần dùng dịch vụ ping miễn phí để giữ Scheduler quét đồng bộ liên tục:

1. Đăng ký tài khoản miễn phí tại [uptimerobot.com](https://uptimerobot.com).
2. Tạo monitor mới:
   - **Monitor Type**: `HTTP(s)`.
   - **Friendly Name**: `HybridFlow Health Check`.
   - **URL**: `https://[ten-backend-cua-ban].onrender.com/api/v1/health`.
   - **Monitoring Interval**: `5 minutes`.
3. Nhấn **Create Monitor**. UptimeRobot sẽ tự động gửi request mỗi 5 phút, giữ backend luôn hoạt động.
