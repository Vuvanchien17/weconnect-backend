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

- CRUD đầy đủ: create / get / update / delete
- Rich blocks: text, image, video, embed, location, feeling, event
- Tags, collaborators

### ✅ Reaction (Post)

- Bảng `reaction_master` (loại reaction) + `post_reaction` (user ↔ post ↔ loại)
- Service xử lý react / unreact / đổi loại reaction trên cùng 1 post
- Validate payload bằng Zod (`src/validations/reaction.schema.js`)
- Seed `reaction_master` qua `prisma/seed.js`

### 🔲 Schema-only (chưa có API)

- Friend system: `FriendShip`, `FriendRequest`, `UserBlock` (Prisma)
- MongoDB: Notification, Conversation, Message (Mongoose)

## Branch & trạng thái hiện tại

- **Branch vừa merge**: `feat-CRUD-post` → `main` (PR #4, merge commit `bf77cfa`)
  - CRUD Post đầy đủ + hệ thống Reaction
  - Thêm models Friend/Block (schema-only, chưa có API)
- **Trạng thái**: chưa có branch feature mới đang active
- Trước khi tạo branch mới, hỏi lại nếu chưa rõ feature nào sẽ làm tiếp

## Conventions

- Dùng `async/await`, không dùng `.then().catch()` trừ khi có lý do
- Error handling qua middleware tập trung — throw error, không tự `res.status()`
- Tên biến / hàm: `camelCase`; tên file: `camelCase.js`
- Import theo thứ tự: built-in → third-party → internal
- Không hardcode secret, dùng `process.env.*`
- Prisma cho mọi thao tác MySQL; Mongoose cho MongoDB collections

### Phân tầng module — trách nhiệm rõ ràng

- **`controllers/`**: CHỈ tiếp nhận `req` / trả `res`. Không đụng DB, không chứa business logic. Nhiệm vụ: parse input từ `req` → gọi service tương ứng → trả kết quả về client.
- **`services/`**: Chứa toàn bộ business logic nặng và là nơi DUY NHẤT giao tiếp với database (Prisma / Mongoose / Redis). Service không biết gì về `req`/`res`.
- **`routes/`**: CHỈ định nghĩa endpoint và map sang controller. Không chứa logic. Gắn middleware (auth, validation, upload...) tại đây.
- **`middlewares/`**: Auth, validation, error handler, v.v. Các route đụng đến tài nguyên người dùng (post, profile, friend, reaction...) **bắt buộc qua middleware auth** để xác thực JWT trước khi vào controller.

### Routing

- Root router mount tại `/api/v1` ở [src/server.js](src/server.js#L32) — khi thêm router mới, chỉ cần đăng ký trong `routes/index.route.js`, không sửa `server.js`.

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
