# WeConnect Backend — Project Context

Mạng xã hội backend. Đọc file này trước khi làm bất cứ điều gì.

## Stack

- **Runtime**: Node.js + Express.js v5
- **SQL DB**: MySQL via Prisma ORM
- **NoSQL DB**: MongoDB (Notification, Conversation, Message schemas)
- **Cache / Queue**: Redis
- **Storage**: Cloudinary (ảnh, video)
- **Real-time**: Socket.io
- **Email**: Nodemailer
- **Auth**: JWT (access + refresh token), Google OAuth 2.0

## Cấu trúc thư mục

```
src/
  controllers/     # Route handlers
  services/        # Business logic
  routes/          # Express routers
  middlewares/     # Auth, error handling, validation
  models/          # Prisma models (MySQL) + Mongoose schemas (MongoDB)
  utils/           # Helpers, mailTemplate.js, cloudinary config...
  config/          # DB connections, env config
prisma/
  schema.prisma    # MySQL schema
```

> Nếu chưa chắc về cấu trúc thực tế, hãy đọc file trước khi sửa.

## Các module đã implement

### ✅ Auth

- Signup / Signin (email + password)
- JWT access token + refresh token
- Blacklist token (Redis)
- Google OAuth 2.0
- Forgot password / Reset password bằng OTP qua email
  - ✅ `forgotPassword`: tạo OTP 6 số, lưu Redis 60s, gửi mail
  - ✅ `verifyOTP`: kiểm tra OTP, trả về `resetToken` (Redis 15p) — không giới hạn số lần nhập
  - ✅ `resetPassword`: xác thực resetToken, hash + cập nhật password mới
  - ✅ `resendOTP`: cooldown 60s, tạo lại OTP mới

### ✅ User

- Xem / cập nhật profile
- Fill base profile (onboarding)
- Tìm kiếm user
- Upload avatar / cover → Cloudinary

### ✅ Post

- Tạo bài đăng với rich blocks: text, image, video, embed, location, feeling, event
- Tags, collaborators

### 🔲 Chưa có API (schema MongoDB đã có)

- Notification
- Conversation
- Message

## Branch & trạng thái hiện tại

- **Branch hiện tại**: `feat-forgot-password`
- **Trạng thái**: Toàn bộ forgot password flow đã hoàn thành (forgotPassword → verifyOTP → resetPassword → resendOTP)
- Trước khi tạo branch mới, hỏi lại nếu chưa rõ feature nào đang active

## Conventions

- Dùng `async/await`, không dùng `.then().catch()` trừ khi có lý do
- Error handling qua middleware tập trung — throw error, không tự `res.status()`
- Tên biến / hàm: `camelCase`; tên file: `camelCase.js`
- Import theo thứ tự: built-in → third-party → internal
- Không hardcode secret, dùng `process.env.*`
- Prisma cho mọi thao tác MySQL; Mongoose cho MongoDB collections

## Lệnh thường dùng

```bash
npm start          # Chạy dev server
npx prisma studio    # Xem DB qua UI
npx prisma migrate dev --name <tên>   # Tạo migration mới
npx prisma generate  # Regenerate Prisma client sau khi sửa schema
```

## Lưu ý quan trọng

- Refresh token lưu trong Redis với TTL — kiểm tra key pattern trước khi sửa logic
- Cloudinary config nằm trong `src/config/` — không tự đổi upload preset
- Socket.io chưa có logic, chỉ mới khởi tạo kết nối
- MongoDB và MySQL dùng song song — Notification/Conversation/Message là Mongoose, còn lại là Prisma
