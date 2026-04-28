# WeConnect — Backend

> Mạng xã hội fullstack (phần backend), xây dựng theo kiến trúc layered (Controller / Service / Route) với Node.js + Express, lai giữa MySQL và MongoDB để tận dụng đặc tính của từng loại database.

---

## Mục lục

- [Giới thiệu](#giới-thiệu)
- [Tech Stack](#tech-stack)
- [Kiến trúc dự án](#kiến-trúc-dự-án)
- [Tính năng đã hoàn thành](#tính-năng-đã-hoàn-thành)
- [Thiết kế Database](#thiết-kế-database)
- [Điểm kỹ thuật nổi bật](#điểm-kỹ-thuật-nổi-bật)
- [Cài đặt & chạy](#cài-đặt--chạy)
- [API Reference](#api-reference)
- [Roadmap / Hướng phát triển](#roadmap--hướng-phát-triển)
- [Tác giả](#tác-giả)

---

## Giới thiệu

**WeConnect** là một dự án mạng xã hội (social network) lấy cảm hứng từ Facebook, được xây dựng để trau dồi kỹ năng backend nâng cao: thiết kế schema phức tạp, xử lý realtime, authentication đa phương thức, upload media, caching, v.v.

Project tập trung vào **chất lượng code** và **kiến trúc rõ ràng** thay vì chạy đua tính năng:

- Phân tầng module nghiêm ngặt (Controller / Service / Route / Middleware)
- Mỗi tầng có một trách nhiệm duy nhất, tránh god-object
- Validation tách rời bằng Zod schema
- Transaction-safe cho mọi business logic phức tạp (Prisma `$transaction`)
- Soft delete + audit fields (`isDeleted`, `isEdited`, `createdAt`, `updatedAt`)

---

## Tech Stack

| Layer | Công nghệ | Lý do chọn |
|---|---|---|
| **Runtime** | Node.js + Express.js v5 | Stack quen thuộc, ecosystem lớn, Express v5 hỗ trợ async error handling native |
| **SQL DB** | MySQL + Prisma ORM | Quan hệ rõ ràng cho User/Post/Friendship; Prisma có type-safety, migration tốt |
| **NoSQL DB** | MongoDB + Mongoose | Tối ưu cho Notification / Message / Conversation — schema linh hoạt, write-heavy |
| **Cache / Queue** | Redis | Blacklist JWT, lưu OTP forgot password, cooldown resend OTP, session tạm |
| **Storage** | Cloudinary | CDN miễn phí, transform ảnh on-the-fly, public_id để cleanup file cũ |
| **Realtime** | Socket.io | Notification / chat realtime (chuẩn bị infrastructure) |
| **Email** | Nodemailer | Gửi OTP qua Gmail SMTP |
| **Auth** | JWT (access + refresh) + Google OAuth 2.0 | Stateless, scalable; OAuth qua Passport.js |
| **Validation** | Zod v4 | Type-safe, cùng schema dùng cho coerce + parse |
| **Upload** | Multer + multer-storage-cloudinary | Stream trực tiếp từ request lên Cloudinary, không lưu disk local |

---

## Kiến trúc dự án

### Phân tầng module

```
┌─────────────┐
│   Routes    │  Định nghĩa endpoint, gắn middleware (auth, validate, upload)
└──────┬──────┘
       │
┌──────▼──────┐
│ Middlewares │  protectedRoute, checkBlackList, validate, uploadCloud
└──────┬──────┘
       │
┌──────▼──────┐
│ Controllers │  Parse req → gọi service → trả res. KHÔNG đụng DB.
└──────┬──────┘
       │
┌──────▼──────┐
│  Services   │  Business logic + giao tiếp database. KHÔNG biết req/res.
└──────┬──────┘
       │
┌──────▼──────┐
│    Models   │  Prisma (MySQL) + Mongoose (MongoDB)
└─────────────┘
```

### Cấu trúc thư mục

```
backend/
├── prisma/
│   ├── schema.prisma          # MySQL schema (12+ models)
│   ├── migrations/            # Versioned SQL migrations
│   └── seed.js                # Seed master data (reactions, feelings, events, privacy)
├── src/
│   ├── config/                # DB connections, Cloudinary, Passport, Mail
│   ├── controllers/           # Route handlers (mỏng, không có logic)
│   ├── services/              # Business logic, DB queries
│   ├── routes/                # Express routers, mount tại /api/v1
│   ├── middlewares/           # Auth (JWT), blacklist check, Zod validate
│   ├── models/
│   │   └── mongoDB/           # Mongoose schemas: Notification, Conversation, Message, Session
│   ├── validations/           # Zod schemas (input validation)
│   ├── utils/                 # Helpers, constants, mail templates
│   └── server.js              # Entry point
└── package.json
```

### Routing

Toàn bộ API mount ở base `/api/v1`. Một số nguyên tắc:

- **Public route** (`/auth/*`): không cần token — signin, signup, forgot password, OAuth callback
- **Protected route**: `protectedRoute` middleware verify JWT + `checkBlackList` đảm bảo token chưa bị revoke
- **Nested route** (vd `/posts/:postId/reactions`): dùng `Router({ mergeParams: true })` để truy cập param từ parent

---

## Tính năng đã hoàn thành

### Authentication & Authorization

- **Sign up / Sign in** với email + password (hash bcrypt)
- **JWT access token + refresh token**
  - Access token TTL ngắn (15 phút), gắn vào header `Authorization: Bearer ...`
  - Refresh token TTL dài (7 ngày), lưu trong **HttpOnly cookie** chống XSS
- **Token blacklist** (Redis): khi user signout, access token bị thêm vào blacklist với TTL = thời gian còn lại của token → middleware `checkBlackList` reject
- **Sign out all devices**: invalidate toàn bộ refresh token của user
- **Google OAuth 2.0** qua Passport.js — auto-create account khi đăng nhập lần đầu
- **Forgot password flow** (4 bước, OTP qua email):
  1. `forgotPassword` — sinh OTP 6 số, lưu Redis TTL 60s, gửi mail
  2. `verifyOTP` — verify OTP, trả về `resetToken` (TTL 15 phút)
  3. `resetPassword` — verify resetToken, hash password mới
  4. `resendOTP` — cooldown 60s tránh spam
- **Change password** (đã đăng nhập): yêu cầu password cũ trước khi đổi

### User & Profile

- Xem profile cá nhân (`GET /users/me`) — flatten User + Profile thành 1 object
- Cập nhật profile (`PUT /users/profile`) — hỗ trợ thay/xóa avatar + cover image
- Onboarding (`POST /users/infor`) — fill base profile sau khi sign up
- **Tìm kiếm user** theo `userName` hoặc `displayName` (LIKE match, exclude self, exclude deleted)
- Upload avatar / cover → Cloudinary, **tự động cleanup file cũ** khi update để tiết kiệm storage

### Post (Rich Content)

Post được thiết kế theo kiến trúc **block-based** (giống Notion / Medium): mỗi post có nhiều `PostBlock`, mỗi block có `type` và `content` (JSON).

**Các loại block hỗ trợ:**

| Type | Content |
|---|---|
| `text` | Văn bản thuần |
| `image` | Ảnh upload Cloudinary |
| `video` | Video upload Cloudinary |
| `embed` | YouTube/Vimeo URL preview |
| `location` | Check-in địa điểm |
| `feeling` | Cảm xúc/hành động (😊 đang cảm thấy hạnh phúc) — link đến `FeelingMaster` |
| `event` | Cột mốc cuộc đời (💼 New Job, 🎓 Graduated, ❤️ New Relationship) — link `EventMaster` |

**CRUD đầy đủ:**

- `POST /posts` — tạo, hỗ trợ multipart upload + JSON blocks (transaction-safe)
- `GET /posts` — list với offset pagination + filter theo `userId`
- `GET /posts/:id` — chi tiết
- `PUT /posts/:id` — update với chiến lược **full-replace** + cleanup Cloudinary file cũ
- `DELETE /posts/:id` — soft delete (`isDeleted = true`)

**Tính năng phụ:**

- **Tag user**: tag bạn bè trong post (bảng `PostTag`)
- **Collaborator**: mời nhiều người làm đồng tác giả (status: `pending` / `accepted` / `rejected`)
- **Privacy**: 6 cấp độ — `public`, `friends`, `friends_except`, `specific_friends`, `private`, `custom`
- **Validation phức tạp**: dùng `z.discriminatedUnion` để validate đúng schema cho mỗi block type

### Reaction System

Hệ thống reaction y hệt Facebook (7 loại: 👍 ❤️ 🤗 😂 😮 😢 😡), được thiết kế chuẩn bằng 2 bảng:

- `reaction_master` — danh sách loại reaction (seed sẵn)
- `post_reaction` — quan hệ user × post × loại, **composite PK `(postId, userId)`** đảm bảo 1 user chỉ có 1 reaction trên 1 post

**API:**

- `POST /posts/:postId/reactions` — react / đổi emoji (dùng `upsert`, race-safe)
- `DELETE /posts/:postId/reactions` — bỏ react
- `GET /posts/:postId/reactions?type=love` — list user đã react + summary count theo loại

**Tích hợp vào News Feed:** mỗi post trả về thêm field `stats.reactions` gồm:

- `total` — tổng số react
- `topTypes` — top 3 emoji có nhiều lượt nhất
- `myReaction` — reaction của user đang đăng nhập (hoặc `null`)

Implementation chống N+1 query: dùng `groupBy` 1 lần cho tất cả `postIds` của page, sau đó merge vào response.

### News Feed

- Offset pagination với metadata (`total_posts`, `current_page`, `total_pages`, `limit`)
- Mỗi post bao gồm: author info, blocks (sorted by position), privacy, tags, collaborators, reaction stats
- Cấu trúc response chuẩn REST cho FE dễ consume

### Schema sẵn sàng (chưa có API)

Đã thiết kế schema, sẵn sàng cho phase tiếp theo:

- **Friend system** (Prisma): `Friendship` (lưu 2 chiều), `FriendRequest` (1 chiều có status), `UserBlock`
- **Notification** (MongoDB): event-based (`friend_request`, `post_reaction`, `comment`, `message`...)
- **Chat** (MongoDB): `Conversation` (direct + group), `Message`, support `unreadCounts` per participant qua `Map`
- **Session** (MongoDB): refresh token store, TTL index auto-cleanup khi hết hạn

---

## Thiết kế Database

### MySQL (Prisma) — quan hệ chặt chẽ

```
User ──┬── Profile (1-1)
       ├── Account (1-N)            -- OAuth providers
       ├── Post (1-N)
       ├── PostTag (M-N)            -- created/received
       ├── PostCollaborator (M-N)   -- inviter/invitee
       ├── PostReaction (M-N)
       ├── Friendship (M-N)         -- 2 chiều: lưu (A,B) và (B,A)
       ├── FriendRequest (1-N)      -- sender/receiver
       └── UserBlock (M-N)

Post ──┬── PostBlock (1-N)          -- rich content
       ├── PostPrivacy (N-1)
       ├── PostTag (1-N)
       ├── PostCollaborator (1-N)
       └── PostReaction (1-N)
```

**Decisions đáng chú ý:**

- **`BigInt` cho ID** — chuẩn cho social network có thể grow lên hàng triệu user/post
- **Composite PK** thay vì surrogate key cho bảng quan hệ thuần (Friendship, UserBlock, PostReaction) — tiết kiệm storage và index
- **Composite indexes** — `Post(userId, createdAt)` cho query "post của user X mới nhất", `FriendRequest(receiverId, status, createdAt)` cho inbox query
- **Soft delete** thay vì hard delete — preserve referential integrity, có thể restore
- **JSON column** cho `PostBlock.content` — flexibility cho nhiều block types khác nhau mà không cần migrate

### MongoDB (Mongoose) — tối ưu cho write-heavy

- **Notification**: index `{ userId, createdAt }` cho query "noti của tôi mới nhất"
- **Conversation**: embed `lastMessage` để list conversation không cần `JOIN` Message; `unreadCounts` dạng Map per-user
- **Message**: index `{ conversationId, createdAt }` cho cursor pagination chat history
- **Session**: TTL index `expiresAt` → MongoDB tự xóa session hết hạn

---

## Điểm kỹ thuật nổi bật

### 1. Transaction-safe complex operations

Mọi business logic chạm nhiều bảng đều bọc trong `prisma.$transaction()`:

```js
// Ví dụ: tạo post với blocks + tags + collaborators trong 1 transaction
await prisma.$transaction(async (tx) => {
  const post = await tx.post.create({ ... });
  await tx.postBlock.createMany({ data: processedBlocks });
  await tx.postCollaborator.createMany({ data: collaborators });
  await tx.postTag.createMany({ data: tags });
});
```

→ Nếu bất kỳ bước nào fail, toàn bộ rollback. Không có "post tạo xong nhưng mất tags".

### 2. Bulk query — chống N+1

Khi list 10 post, nếu naive sẽ tốn 10 query để lấy reaction stats. Implementation dùng:

```js
prisma.postReaction.groupBy({
  by: ["postId", "reactionId"],
  where: { postId: { in: postIds } },  // bulk filter
  _count: { _all: true },
});
```

→ 1 query duy nhất cho cả page. Helper `buildReactionStatsMap()` aggregate trong memory rồi merge vào response.

### 3. JWT Blacklist với Redis

Vấn đề kinh điển của JWT: token vẫn valid đến khi expire dù user đã sign out. Giải pháp:

- Khi sign out, push token vào Redis với key `blacklist:<token>`, TTL = `exp - now`
- Middleware `checkBlackList` check Redis trước khi cho qua
- Redis TTL tự cleanup, không cần cron job

### 4. OTP flow chống brute-force

- OTP 6 số lưu Redis TTL 60s — hết hạn tự xóa
- `verifyOTP` thành công không tiêu hủy ngay → trả `resetToken` riêng (TTL 15 phút) cho bước reset
- `resendOTP` có cooldown 60s — block spam
- Reset token chỉ dùng được 1 lần (xóa khỏi Redis sau khi reset thành công)

### 5. Cloudinary lifecycle management

Mỗi ảnh/video upload đều lưu cả `url` và `public_id` trong DB. Khi:

- **Update profile/post**: nếu user thay ảnh mới hoặc xóa block image → destroy file cũ qua `cloudinary.uploader.destroy(public_id)`
- **Update post**: diff giữa old blocks và new blocks → chỉ destroy những file thật sự không còn dùng

→ Storage Cloudinary không bị rò rỉ.

### 6. Validation tập trung với Zod

Toàn bộ input validation viết trong `src/validations/*.schema.js`, áp dụng qua middleware `validate(schema)`. Đặc biệt:

- `discriminatedUnion` cho block types — mỗi type có schema riêng
- `z.coerce` để chuyển string từ FormData thành number/date
- `z.preprocess` parse JSON string khi FE gửi qua FormData

### 7. Hybrid SQL + NoSQL

- **SQL** cho domain có quan hệ chặt: User, Post, Friendship → Prisma giúp query phức tạp dễ
- **NoSQL** cho data write-heavy, schema linh hoạt: Notification (payload đa dạng theo type), Conversation (group có thể nhiều fields tùy chỉnh)
- Reference giữa 2 DB: lưu `BigInt userId` của MySQL trong Mongo collection (logical FK, không enforce ở DB level)

---

## Cài đặt & chạy

### Yêu cầu môi trường

- Node.js >= 20
- MySQL >= 8.0
- MongoDB >= 6.0
- Redis >= 7.0
- Tài khoản Cloudinary (free tier OK)
- Tài khoản Google Cloud Console (cho OAuth)
- Gmail account + App Password (cho gửi OTP)

### Bước 1: Clone & install

```bash
git clone <repo-url>
cd backend
npm install
```

### Bước 2: Tạo file `.env`

```env
# Database
MYSQL_URI="mysql://user:password@localhost:3306/weconnect"
MONGO_URI="mongodb://localhost:27017/weconnect"
REDIS_URI="redis://localhost:6379"

# JWT
JWT_SECRET_KEY="your-strong-secret-here"
JWT_REFRESH_SECRET_KEY="another-strong-secret"

# Cloudinary
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."

# Google OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_CALLBACK_URL="http://localhost:5000/api/v1/auth/google/callback"

# Email (Nodemailer)
MAIL_USER="your-email@gmail.com"
MAIL_PASS="gmail-app-password"

# Frontend
CLIENT_URL="http://localhost:3000"
```

### Bước 3: Chạy migration + seed

```bash
npx prisma migrate dev          # Apply migrations + generate Prisma client
npx prisma db seed              # Seed master data (reactions, feelings, events, privacy)
```

### Bước 4: Khởi động server

```bash
npm start                       # Nodemon + auto-reload
```

Server chạy tại `http://localhost:5000`. Base API: `http://localhost:5000/api/v1`.

---

## API Reference

### Auth (`/api/v1/auth`)

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/signup` | Đăng ký email + password |
| POST | `/signin` | Đăng nhập, trả access + refresh token |
| POST | `/signout` | Đăng xuất, blacklist token |
| POST | `/signout-all` | Đăng xuất tất cả thiết bị |
| POST | `/refresh` | Lấy access token mới từ refresh token |
| POST | `/forgot-password` | Gửi OTP qua email |
| POST | `/verify-otp` | Xác thực OTP, trả resetToken |
| POST | `/reset-password` | Đặt lại password |
| POST | `/resend-otp` | Gửi lại OTP (cooldown 60s) |
| PATCH | `/change-password` | Đổi password (đã đăng nhập) |
| GET | `/google` | Bắt đầu OAuth flow |
| GET | `/google/callback` | OAuth callback |

### User (`/api/v1/users`)

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/me` | Lấy thông tin user hiện tại (User + Profile) |
| PUT | `/profile` | Cập nhật profile + avatar/cover |
| POST | `/infor` | Onboarding (fill base profile) |
| GET | `/search?q=keyword` | Tìm kiếm user |

### Post (`/api/v1/posts`)

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/` | Tạo post với blocks/tags/collaborators |
| GET | `/?userId=&page=&limit=` | List feed, filter theo user |
| GET | `/:id` | Chi tiết 1 post |
| PUT | `/:id` | Update post (full-replace) |
| DELETE | `/:id` | Soft delete |

### Reaction (`/api/v1/posts/:postId/reactions`)

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/` | React / đổi emoji (`{ reactionId }`) |
| DELETE | `/` | Bỏ react |
| GET | `/?type=&page=&limit=` | List user đã react + summary count |

> **Authentication**: tất cả route trừ `/auth/*` đều cần header `Authorization: Bearer <accessToken>`.

---

## Roadmap / Hướng phát triển

Project được thiết kế theo **phase rõ ràng**, mỗi phase mở khóa được phase tiếp theo:

### Phase 1: Mở rộng tương tác (đang làm)

- [ ] **Comment system** — 2-cấp threading (top-level + replies)
  - Soft delete, edit history
  - Comment mention `@username`
  - Tích hợp `stats.comments` vào feed
- [ ] **Comment reaction** — y hệt PostReaction
- [ ] **Share / Repost post**

### Phase 2: Quan hệ user

- [ ] **Friend system** (schema đã có)
  - Send / accept / reject friend request
  - Unfriend, list friends
  - Block / unblock user
- [ ] **Privacy enforcement trong Feed**
  - `public` → ai cũng xem
  - `friends` → check Friendship
  - `private` → chỉ owner
  - Loại bỏ post của user đã block

### Phase 3: Notification + Realtime

- [ ] **Notification system** (Mongoose schema đã có)
  - Triggers: friend request, accept, react, comment, mention, message
  - Persist Mongo + emit qua Socket.io
  - Mark read / unread, badge count
- [ ] **Chat realtime**
  - Direct message + group chat
  - Typing indicator, online status
  - Read receipts (`seenBy`, `unreadCounts`)
  - Image attachment

### Phase 4: Search & Discovery

- [ ] **Full-text search post**
  - Phương án A: MySQL `FULLTEXT INDEX` (đơn giản, đủ cho v1)
  - Phương án B: Elasticsearch / Meilisearch (scale tốt hơn)
- [ ] **Hashtag** — extract `#hashtag` khi tạo post, lưu bảng riêng để aggregate trending
- [ ] **Suggest friend** — algorithm dựa trên mutual friends + interaction graph

### Phase 5: Performance & Production

- [ ] **Cache feed page đầu** trong Redis (TTL 30s) — giảm tải DB cho user truy cập liên tục
- [ ] **Counter denormalization** — lưu `reactionCount` trực tiếp trên Post, sync bằng atomic increment
- [ ] **Fan-out on write** cho user có nhiều follower (push post vào Redis feed của followers)
- [ ] **Rate limiting** với `express-rate-limit` + Redis store
- [ ] **Centralized error handler** middleware — chuẩn hóa response error
- [ ] **Logging** với Winston + log rotation
- [ ] **Health check endpoint** + readiness/liveness probe
- [ ] **CI/CD** pipeline (GitHub Actions) + Docker compose

### Phase 6: Testing

- [ ] **Unit test** cho services bằng Jest + mock Prisma
- [ ] **Integration test** end-to-end với Supertest
- [ ] **API documentation** với Swagger / OpenAPI

### Phase 7: Tính năng nâng cao

- [ ] **Post draft** — lưu nháp tự động
- [ ] **Schedule post** — lên lịch đăng (Bull queue)
- [ ] **Story** (24h auto-expire) — TTL index của Mongo phù hợp
- [ ] **Live video** với WebRTC
- [ ] **Marketplace** / **Group** / **Page** (mở rộng theo hướng FB)

---

## Tác giả

**Vũ Văn Chiến** — Backend Developer

- Email: hieungo20052808@gmail.com
- Đam mê backend, system design và database optimization
- GitHub: [Vuvanchien17](https://github.com/Vuvanchien17)

---

## Ghi chú

> Project được phát triển với mục đích học tập và showcase kỹ năng backend. Mỗi tính năng đều được suy nghĩ kỹ về **tradeoffs**: performance vs. simplicity, normalization vs. denormalization, SQL vs. NoSQL. README này phản ánh quá trình tư duy đó hơn là chỉ liệt kê tính năng.
