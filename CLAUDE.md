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

### ✅ Comment (Post)

- Bảng `Comment` với threading **2 cấp**: top-level (`parentId = null`) + reply (`parentId` trỏ đến top-level)
- **Auto-flatten**: nếu user reply trên 1 reply → backend tự set `parentId` về top-level grandparent (không nested 3 cấp)
- CRUD đầy đủ + **soft delete** (`isDeleted=true`, không xóa vĩnh viễn DB)
- **Permission xóa 2-tier**: comment owner HOẶC post owner đều xóa được (giống FB)
- Tích hợp `stats.comments.total` vào response của News Feed (`GET /posts`)
- Endpoint chia 2 group: nested (`/posts/:postId/comments`) cho create/list, top-level (`/comments/:id`) cho replies/update/delete
- Xem chi tiết API ở section [API Reference — Comment](#api-reference--comment-fe-integration-guide) bên dưới

### ✅ Friend System

- **Friend Request** với 4 thao tác: send / accept / reject / cancel
- **Auto-match**: khi A và B cùng gửi request cho nhau → BE tự accept request cũ thay vì tạo request thừa
- **Friendship 2 chiều**: lưu cả `(A, B)` và `(B, A)` → query "ai là bạn của X" đơn giản
- **Block system**: block 1 chiều, transaction tự động unfriend + xóa pending request giữa 2 user
- **Friend Status API** trả 1 trong 7 state (`self / none / friends / pending_outgoing / pending_incoming / blocked_by_me / blocked_by_them`) — FE dùng để render đúng button
- **Privacy filter trong News Feed**:
  - `public` → ai cũng xem
  - `friends` → owner + bạn bè
  - `private` → chỉ owner
  - Post của user trong block list (2 chiều) bị ẩn
  - Xem detail post không có quyền → 404 (information hiding)
- **TODO v2**: `friends_except` / `specific_friends` / `custom` hiện đang treat như `friends` — cần thêm bảng phụ để implement chính xác
- Xem chi tiết API ở section [API Reference — Friend System](#api-reference--friend-system-fe-integration-guide) bên dưới

### 🔲 Schema-only (chưa có API)

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

---

## API Reference — News Feed (Cursor Pagination)

> News Feed dùng **cursor pagination** cho infinite scroll. KHÔNG có `total_pages` / `total_posts`.

### Endpoint

```http
GET /api/v1/posts?cursor=<lastId>&limit=10&userId=<optional>
Authorization: Bearer <accessToken>
```

**Query params:**
| Param | Default | Mô tả |
|---|---|---|
| `cursor` | — | `id` của post cuối cùng đã load. **Lần đầu bỏ trống**. |
| `limit` | `10` | 1-50 |
| `userId` | — | Optional — lọc post của 1 user (cho profile page) |

**Response 200:**
```json
{
  "message": "Get posts successfully!",
  "data": [
    {
      "id": "100",
      "author": { "id": "7", "displayName": "...", "avatar": "..." },
      "postBlocks": [...],
      "postPrivacy": { ... },
      "postTags": [...],
      "postCollaborators": [...],
      "stats": {
        "reactions": { "total": 42, "topTypes": [...], "myReaction": {...} },
        "comments": { "total": 17 }
      },
      "created_at": "...",
      "updated_at": "..."
    }
    /* ... thêm 9 post nữa, sort id DESC */
  ],
  "metadata": {
    "limit": 10,
    "nextCursor": "91",
    "hasNext": true
  }
}
```

**Lưu ý FE:**
- Lần đầu mount feed: `GET /posts?limit=10` (không gửi cursor)
- Lần sau: `GET /posts?cursor=<nextCursor từ response trước>&limit=10`
- Khi `metadata.hasNext === false` → đã hết feed, **không gọi tiếp** (`nextCursor` sẽ là `null`)
- Post mới do user khác đăng giữa các lần scroll **KHÔNG** xuất hiện tự động → muốn show "X bài viết mới ở trên" → cần feature "pull-to-refresh" gọi `?cursor=` (không truyền cursor) lấy lại từ đầu

### Privacy filter — auto-applied ở backend

FE **không cần làm gì** — backend tự lọc:
- Post `public` → mọi user thấy
- Post `friends` (và các biến thể) → chỉ owner + bạn bè (Friendship table) thấy
- Post `private` → chỉ owner thấy
- Post của user trong block list (2 chiều: mình block hoặc bị block) → ẩn hoàn toàn

Hệ quả phía FE:
- Cùng 1 endpoint `/posts`, mỗi user thấy feed khác nhau (đã filter sẵn)
- Số lượng `data` có thể nhỏ hơn `limit` ngay cả khi `hasNext: true` — đó là bình thường (filter ở DB layer, không leak count)
- `GET /posts/:id` post không có quyền → trả **404** (không 403, không tiết lộ post tồn tại) → FE handle như "post không tồn tại"

---

## API Reference — Friend System (FE Integration Guide)

> Mọi endpoint đều **yêu cầu xác thực** — header `Authorization: Bearer <accessToken>`.
>
> **Base URL**: `http://localhost:5000/api/v1`
> **BigInt → string**: tất cả `id` trong response là **string**.

### State machine — quan hệ giữa 2 user

```
                     A và B (lạ)
                          │
                ┌─────────┴─────────┐
                │ A gửi friend request │
                ▼                     ▲
      ┌──────────────────┐            │
      │ pending_outgoing │ ──cancel──┘
      │  (A → B)         │
      └────────┬─────────┘
               │ B accept
               ▼
         ┌─────────┐
         │ friends │ ──unfriend──→ none
         └────┬────┘
              │ A block B (từ bất kỳ state nào)
              ▼
       ┌──────────────┐
       │ blocked_by_me│ ──unblock──→ none
       └──────────────┘
```

### Friend Status — endpoint quan trọng nhất

```http
GET /api/v1/users/:userId/friend-status
```

Trả 1 trong 7 state, FE dùng để render đúng button:

| Status | Mô tả | UI gợi ý |
|---|---|---|
| `self` | Đang xem profile của chính mình | Hiện "Edit Profile" thay vì friend button |
| `none` | Không quan hệ | Button "Add Friend" |
| `pending_outgoing` | Mình đã gửi, chờ họ xử lý | Button "Cancel Request" + `requestId` (để gọi cancel) |
| `pending_incoming` | Họ đã gửi, mình chưa xử lý | Button "Confirm" / "Delete" + `requestId` (để accept/reject) |
| `friends` | Đã là bạn | Button "Friends ▼" (dropdown unfriend/block) + `friendsSince` |
| `blocked_by_me` | Mình đã block họ | Button "Unblock" |
| `blocked_by_them` | Họ đã block mình | Hiện "User unavailable" — KHÔNG hiện button friend |

**Response example:**

```json
// status = friends
{
  "message": "Get friend status successfully.",
  "status": "friends",
  "friendsSince": "2026-04-15T10:00:00.000Z"
}

// status = pending_outgoing
{
  "message": "Get friend status successfully.",
  "status": "pending_outgoing",
  "requestId": "42"
}

// status = none
{
  "message": "Get friend status successfully.",
  "status": "none"
}
```

---

### Response shape — User compact (dùng chung)

```json
{
  "id": "7",
  "userName": "vuvanchien",
  "displayName": "Vũ Văn Chiến",
  "avatar": "https://res.cloudinary.com/.../avatar.jpg"
}
```

### Response shape — FriendRequest

```json
{
  "id": "42",
  "status": "pending",
  "sender": { /* user compact */ },
  "receiver": { /* user compact */ },
  "createdAt": "2026-04-30T10:00:00.000Z",
  "respondedAt": null
}
```

---

### 1. Gửi lời mời kết bạn

```http
POST /api/v1/friend-requests
Content-Type: application/json
```

**Body:**
```json
{
  "receiverId": 5
}
```

**Response 201 — Tạo request mới:**
```json
{
  "message": "Friend request sent successfully.",
  "type": "request_sent",
  "request": { /* FriendRequest shape */ }
}
```

**Response 201 — Auto-match (B đã gửi cho A trước, A click Add → tự accept):**
```json
{
  "message": "You are now friends!",
  "type": "auto_matched",
  "request": { /* FriendRequest accepted */ },
  "friend": { /* User compact của bên kia */ }
}
```

**Errors:**
| Code | Khi nào | Message |
|---|---|---|
| 400 | Tự gửi cho mình | `"Cannot send friend request to yourself."` |
| 400 | Đã là bạn | `"Already friends."` |
| 400 | Đã có pending từ mình | `"Friend request already sent."` |
| 403 | Có block 2 chiều | `"Cannot send friend request — user is blocked."` |
| 404 | Receiver không tồn tại | `"User not found."` |

**FE pattern:**
- Phân biệt `type` → render UI khác (toast "Request sent" vs "You are now friends!")
- Sau request_sent: gọi `getFriendStatus` lại hoặc tự update state thành `pending_outgoing`

---

### 2. Chấp nhận lời mời

```http
PATCH /api/v1/friend-requests/:id/accept
```

**Response 200:**
```json
{
  "message": "Friend request accepted.",
  "request": { /* FriendRequest với status: "accepted" */ },
  "friend": { /* User compact của sender */ }
}
```

**Errors:**
| Code | Khi nào | Message |
|---|---|---|
| 400 | Request đã processed | `"Friend request already processed."` |
| 403 | Mình không phải receiver | `"You don't have permission to accept this request."` |
| 404 | Request không tồn tại | `"Friend request not found."` |

---

### 3. Từ chối lời mời

```http
PATCH /api/v1/friend-requests/:id/reject
```

**Response 200:** `{ "message": "Friend request rejected." }`

**Errors:** giống endpoint 2.

> Sau reject, sender **CÓ THỂ gửi lại** (status đã rejected, không còn match `pending`).

---

### 4. Hủy lời mời mình đã gửi

```http
DELETE /api/v1/friend-requests/:id
```

Khác với reject:
- **Reject** = receiver từ chối (UPDATE status=rejected, giữ history)
- **Cancel** = sender hủy lời mời mình đã gửi (DELETE row hoàn toàn)

**Response 200:** `{ "message": "Friend request cancelled." }`

**Errors:**
| Code | Khi nào | Message |
|---|---|---|
| 400 | Request đã processed | `"Cannot cancel — request already processed."` |
| 403 | Mình không phải sender | `"You don't have permission to cancel this request."` |
| 404 | Request không tồn tại | `"Friend request not found."` |

---

### 5. Inbox — lời mời đến mình

```http
GET /api/v1/friend-requests/inbox?cursor=&limit=10
```

Cursor pagination, sort `id DESC` (newest first). Chỉ trả request `status=pending`.

**Response 200:**
```json
{
  "message": "Get inbox successfully.",
  "data": [ /* FriendRequest[] */ ],
  "metadata": { "limit": 10, "nextCursor": "23", "hasNext": true }
}
```

### 6. Outbox — lời mời mình đã gửi

```http
GET /api/v1/friend-requests/outbox?cursor=&limit=10
```

Same shape như inbox. Pending only.

---

### 7. List bạn của 1 user

```http
GET /api/v1/users/:userId/friends?cursor=&limit=10
```

**`userId`** có thể là chính mình hoặc user khác (FE hiển thị friend list của ai cũng được).

**Response 200:**
```json
{
  "message": "Get friends successfully.",
  "data": [
    {
      "id": "5",
      "userName": "...",
      "displayName": "...",
      "avatar": "...",
      "friendsSince": "2026-04-01T..."
    }
  ],
  "metadata": { "limit": 10, "nextCursor": "<friendId>", "hasNext": true }
}
```

> **`cursor`** ở đây là `friendId` (BigInt string) — không phải `id` autoincrement.

**Errors:** 404 nếu `userId` không tồn tại.

---

### 8. Unfriend

```http
DELETE /api/v1/friends/:userId
```

**Response 200:** `{ "message": "Unfriend successfully." }`

**Errors:**
| Code | Khi nào | Message |
|---|---|---|
| 400 | Tự unfriend chính mình | `"Invalid operation."` |
| 404 | Không phải bạn | `"You are not friends with this user."` |

> Backend tự xóa cả 2 row Friendship `(A,B)` và `(B,A)` trong transaction — FE chỉ cần gọi 1 lần.

---

### 9. Block user

```http
POST /api/v1/blocks
Content-Type: application/json
```

**Body:** `{ "blockedId": 5 }`

**Response 201:**
```json
{
  "message": "User blocked successfully.",
  "blocked": { /* User compact */ }
}
```

**Errors:**
| Code | Khi nào | Message |
|---|---|---|
| 400 | Tự block | `"Cannot block yourself."` |
| 400 | Đã block trước đó | `"User is already blocked."` |
| 404 | User không tồn tại | `"User not found."` |

> **Backend tự cascade**: nếu A và B đang là bạn → unfriend luôn. Nếu có pending request giữa 2 bên → xóa request. FE không cần gọi unfriend riêng trước khi block.

### 10. Unblock

```http
DELETE /api/v1/blocks/:userId
```

**Response 200:** `{ "message": "User unblocked successfully." }`

**Errors:** 404 nếu chưa block (`"User is not blocked."`).

> Unblock **KHÔNG khôi phục** Friendship cũ. Cả 2 phải kết bạn lại từ đầu.

### 11. List user mình đã block

```http
GET /api/v1/blocks?cursor=&limit=10
```

**Response 200:**
```json
{
  "message": "Get blocks successfully.",
  "data": [
    {
      "id": "5",
      "userName": "...",
      "displayName": "...",
      "avatar": "...",
      "blockedAt": "..."
    }
  ],
  "metadata": { "limit": 10, "nextCursor": "<blockedId>", "hasNext": true }
}
```

---

### Edge cases & business rules cho FE

| Tình huống | Backend xử lý | FE nên làm |
|---|---|---|
| User A và B đồng thời click "Add Friend" cho nhau | Auto-match → tạo Friendship luôn | Phân biệt `type: "auto_matched"` để render UI "You are now friends" |
| User reject xong sender gửi lại | Cho phép — request mới | Bình thường |
| User unfriend rồi gửi lại request | Cho phép | Bình thường |
| Block user đang là bạn | Cascade unfriend | Sau block, gọi `getFriendStatus` lại để update state |
| Block user đang có pending | Xóa request | Bình thường |
| Xem profile user đã block mình | `friend-status` trả `blocked_by_them` | Hiện "User unavailable" |
| Spam click "Add" 2 lần | 400 idempotent | Disable button trong 500ms sau click |

---

### Suggested FE state structure (RTK Query)

```js
// userApi
getFriendStatus: builder.query({
  query: (userId) => `/users/${userId}/friend-status`,
  providesTags: (result, error, userId) => [
    { type: "FriendStatus", id: userId }
  ],
}),

// friendApi
sendFriendRequest: builder.mutation({
  query: (receiverId) => ({
    url: "/friend-requests",
    method: "POST",
    body: { receiverId },
  }),
  invalidatesTags: (result, error, receiverId) => [
    { type: "FriendStatus", id: receiverId },
    { type: "Inbox" },
    { type: "Outbox" },
  ],
}),

acceptFriendRequest: builder.mutation({
  query: (requestId) => ({
    url: `/friend-requests/${requestId}/accept`,
    method: "PATCH",
  }),
  invalidatesTags: (result) => [
    { type: "FriendStatus", id: result?.friend?.id },
    { type: "Inbox" },
    { type: "Friends" },
  ],
}),

// Tương tự cho reject / cancel / unfriend / block / unblock
```

**Pattern quan trọng**: mọi mutation thay đổi quan hệ → invalidate tag `FriendStatus` của user kia → component đang render button friend tự refetch và đổi UI.

### Suggested UI flow

```
1. User A search → list user kết quả → mỗi item gọi getFriendStatus
2. Render button theo status:
   - none → "Add Friend" → click sendRequest → status thành pending_outgoing → button "Cancel"
   - pending_incoming → 2 button "Confirm" / "Delete" với requestId từ status
   - friends → "Friends ▼" dropdown (Unfriend / Block)
3. A vào profile B → header có button friend (cùng logic)
4. A vào /friends/inbox → list FriendRequest → 2 button accept/reject với request.id
5. A vào /settings/blocks → list block → button "Unblock" cho từng user
```

---



> Section này dành cho FE developer. Mọi endpoint dưới đây đều **yêu cầu xác thực** — gắn header `Authorization: Bearer <accessToken>`.
>
> **Base URL**: `http://localhost:5000/api/v1`
> **BigInt → string**: Tất cả `id` trong response trả về dưới dạng **string** (vd `"42"`) do MySQL `BigInt` không serialize JSON được. FE cần xử lý như string khi truyền vào URL/body.

### Threading model

- **Top-level comment**: `parentId = null`
- **Reply**: `parentId = id của top-level comment`
- **KHÔNG hỗ trợ nested 3+ cấp**: nếu FE gửi `parentId` trỏ đến 1 reply, backend tự "flatten" về top-level grandparent. Vd:
  - Comment A (id=10, top-level)
  - Reply B (id=15, parentId=10)
  - User click "Reply" trên B → FE gửi `{ content: "...", parentId: 15 }` → BE lưu thành `{ parentId: 10 }`
  - **Khuyến nghị FE**: khi user reply trên reply, prepend `@displayName` vào đầu content để giữ ngữ cảnh (vd `"@Hoa: I agree!"`)

### Response shape — Comment cơ bản

```json
{
  "id": "42",
  "postId": "5",
  "parentId": null,
  "content": "Hello world!",
  "isEdited": false,
  "user": {
    "id": "7",
    "userName": "vuvanchien",
    "displayName": "Vũ Văn Chiến",
    "avatar": "https://res.cloudinary.com/.../avatar.jpg"
  },
  "createdAt": "2026-04-30T10:00:00.000Z",
  "updatedAt": null
}
```

### Response shape — Top-level comment khi LIST

```json
{
  "id": "42",
  "postId": "5",
  "parentId": null,
  "content": "Hello world!",
  "isEdited": false,
  "user": { /* như trên */ },
  "replyCount": 8,
  "previewReplies": [
    { /* shape comment cơ bản */ },
    { /* shape comment cơ bản */ }
  ],
  "createdAt": "...",
  "updatedAt": null
}
```

- `replyCount`: tổng số reply chưa bị xóa
- `previewReplies`: 2 reply oldest đầu tiên (để FE render preview)
- FE pattern: render `previewReplies` + button "View N more replies" với `N = replyCount - 2`. Click button → gọi `GET /comments/:id/replies`

---

### 1. Tạo comment / reply

```http
POST /api/v1/posts/:postId/comments
```

**Body:**
```json
{
  "content": "Comment text here",
  "parentId": null
}
```

| Field | Type | Required | Mô tả |
|---|---|---|---|
| `content` | string | ✅ | 1-2000 ký tự (đã trim trước khi validate) |
| `parentId` | number / string / null | ❌ | `null`/bỏ qua = top-level. Có giá trị = reply |

**Response 201:**
```json
{
  "message": "Create comment successfully!",
  "comment": { /* Comment cơ bản với user info */ }
}
```

**Errors:**
| Code | Khi nào | `message` |
|---|---|---|
| 400 | Content rỗng | `"Comment content is required"` |
| 400 | Content > 2000 chars | `"Comment must be at most 2000 characters"` |
| 400 | parentId trỏ đến comment ở post khác | `"Parent comment does not belong to this post."` |
| 401 | Token sai/thiếu | `"Token invalid."` / `"Not found accessToken or invalid format."` |
| 404 | Post không tồn tại / đã xóa | `"Post not found."` |
| 404 | parentId trỏ đến comment đã xóa/không tồn tại | `"Parent comment not found."` |

---

### 2. List top-level comments của 1 post (cursor pagination)

```http
GET /api/v1/posts/:postId/comments?cursor=<lastId>&limit=10&sort=newest
```

**Query params:**
| Param | Default | Range | Mô tả |
|---|---|---|---|
| `cursor` | — | string | `id` top-level comment cuối cùng đã load. **Lần đầu bỏ trống**. |
| `limit` | `10` | `1-50` | Số comment / lần load |
| `sort` | `newest` | `newest` \| `oldest` | Sort theo `id` (≈ thời gian tạo) |

**Response 200:**
```json
{
  "message": "Get comments successfully!",
  "data": [
    { /* top-level comment với replyCount + previewReplies */ }
  ],
  "metadata": {
    "limit": 10,
    "nextCursor": "23",
    "hasNext": true
  }
}
```

**Lưu ý FE:**
- `data` chỉ chứa **top-level comments** (không có reply ngang hàng)
- `previewReplies` trong mỗi top-level luôn sort `oldest first` (giống thread FB)
- Nếu post không có comment → `data: []`, `metadata.hasNext: false`, `metadata.nextCursor: null`
- Lần đầu mở post: gọi `?limit=10` (không cursor)
- Scroll xuống: gọi `?cursor=<nextCursor từ response trước>&limit=10`
- `hasNext: false` → dừng gọi, render "Hết comment"

---

### 3. List replies của 1 top-level comment (cursor pagination)

```http
GET /api/v1/comments/:id/replies?cursor=<lastId>&limit=10
```

**Query params:**
| Param | Default | Range | Mô tả |
|---|---|---|---|
| `cursor` | — | string | `id` reply cuối cùng đã load. **Lần đầu bỏ trống**. |
| `limit` | `10` | `1-50` | Số reply / lần load |

**Response 200:**
```json
{
  "message": "Get replies successfully!",
  "data": [
    { /* Comment cơ bản — replies sort oldest first */ }
  ],
  "metadata": {
    "limit": 10,
    "nextCursor": "47",
    "hasNext": true
  }
}
```

**Errors:**
| Code | Khi nào | `message` |
|---|---|---|
| 404 | Top-level comment không tồn tại / đã xóa | `"Comment not found."` |

**Lưu ý FE:**
- Replies luôn sort `oldest first` (không có option `sort` như list top-level)
- Lần đầu click "View N more replies": gọi `?limit=10` (không cursor)
- Scroll/click "Load more" trong thread: gọi `?cursor=<nextCursor>&limit=10`

---

### 4. Sửa comment

```http
PUT /api/v1/comments/:id
```

**Body:**
```json
{
  "content": "Edited content"
}
```

**Response 200:**
```json
{
  "message": "Update comment successfully!",
  "comment": {
    /* Comment cơ bản */
    "isEdited": true,
    "updatedAt": "2026-04-30T11:30:00.000Z"
  }
}
```

**Errors:**
| Code | Khi nào | `message` |
|---|---|---|
| 400 | Content rỗng / quá dài | (như endpoint 1) |
| 403 | Không phải owner | `"You don't have permission to edit this comment."` |
| 404 | Comment không tồn tại / đã xóa | `"Comment not found."` |

**Lưu ý FE:**
- Chỉ **owner** mới sửa được. Nút "Edit" chỉ show với comment do user hiện tại tạo.
- Sau khi sửa, `isEdited = true` → FE render `(đã chỉnh sửa)` cạnh timestamp.
- KHÔNG cho đổi `parentId` qua endpoint này — muốn đổi thread thì xóa + tạo mới.

---

### 5. Xóa comment (soft delete)

```http
DELETE /api/v1/comments/:id
```

**Response 200:**
```json
{
  "message": "Delete comment successfully!"
}
```

**Errors:**
| Code | Khi nào | `message` |
|---|---|---|
| 403 | Không phải owner comment, cũng không phải owner post | `"You don't have permission to delete this comment."` |
| 404 | Comment không tồn tại / đã xóa | `"Comment not found."` |

**Lưu ý FE:**
- Xóa được nếu: **comment owner** HOẶC **post owner** (post owner có quyền dọn comment trong post mình)
- Soft delete: comment vẫn còn trong DB, nhưng không xuất hiện trong các API list/get nữa
- **Replies của comment bị xóa**: vẫn tồn tại trong DB, **KHÔNG hiển thị** qua API (do filter `isDeleted: false` ở mọi query) — FE coi như cả thread biến mất
- Sau khi DELETE thành công, FE nên refetch comment list hoặc remove khỏi state ngay

---

### 6. Tích hợp Comment với News Feed

Khi gọi `GET /api/v1/posts?limit=10` (cursor pagination, xem section [News Feed](#api-reference--news-feed-cursor-pagination)), mỗi item trong `data` có thêm field `stats.comments`:

```json
{
  "id": "5",
  "author": { ... },
  "postBlocks": [...],
  "postPrivacy": { ... },
  "postTags": [...],
  "postCollaborators": [...],
  "stats": {
    "reactions": {
      "total": 42,
      "topTypes": [...],
      "myReaction": { "id": 2, "keyName": "love", "icon": "❤️" }
    },
    "comments": {
      "total": 17
    }
  },
  "created_at": "...",
  "updated_at": "..."
}
```

- `stats.comments.total`: **tổng số comment + reply** chưa bị xóa trên post (không tách top-level vs reply)
- FE render: `"17 bình luận"` dưới mỗi post mà **không cần gọi API riêng** — đã được bulk-fetch ở backend

---

### Edge cases & business rules cho FE

| Tình huống | Backend xử lý | FE nên làm |
|---|---|---|
| User reply trên reply (parentId là 1 reply) | Auto-flatten về top-level grandparent | Optional: prepend `@username` vào content trước khi gửi |
| Post bị xóa | Mọi comment endpoint trả 404 | Remove post khỏi feed, comment list biến mất theo |
| Comment chứa emoji / đa ngôn ngữ | OK — content lưu UTF-8 | Render bình thường |
| Comment chứa URL | BE lưu nguyên text | FE tự parse URL → render link |
| Comment quá dài (>2000) | 400 Validation Error | Show count "1980/2000" khi user gõ |
| User đang gõ thì bị logout | Token expire, request fail 401 | Redirect login, giữ nội dung đang gõ trong localStorage |
| 2 user cùng comment cùng lúc | Không xung đột (mỗi comment có id riêng) | — |
| User xóa rồi gửi lại comment cùng nội dung | OK, tạo comment mới (id mới) | — |
| User sửa comment liên tục | Mỗi lần PUT update content + set `isEdited=true` | Show `(đã chỉnh sửa)` |
| User là post owner xóa comment người khác | Cho phép (200 OK) | Show nút "Delete" cho owner post trên mọi comment |

---

### Suggested FE state structure (cursor pagination)

```js
// Cấu trúc state khuyến nghị (RTK Query pattern)
{
  postId: "5",
  comments: [
    {
      ...topLevelComment,        // gồm replyCount + previewReplies sẵn 2 cái
      replies: [],                // populate khi user click "View more"
      replyNextCursor: null,
      replyHasNext: true,         // ban đầu giả định có (sẽ đúng nếu replyCount > 2)
    }
  ],
  nextCursor: null,                // cursor cho top-level kế tiếp
  hasNext: true,
  isLoading: false,
  error: null
}
```

**Flow đề xuất:**

1. Mở post → gọi `GET /posts/:postId/comments?limit=10` (không cursor)
   - State: `comments = data`, `nextCursor = metadata.nextCursor`, `hasNext = metadata.hasNext`
2. Render top-level + `previewReplies` (2 cái sẵn) mỗi top-level
3. Scroll xuống cuối list comment → if `hasNext`: gọi `GET /posts/:postId/comments?cursor=<nextCursor>&limit=10`
   - Append `data` vào `comments`, update `nextCursor` + `hasNext`
4. Click "View N more replies" trên 1 top-level (id=42):
   - Gọi `GET /comments/42/replies?limit=10` (không cursor)
   - State: `comments[i].replies = data`, `replyNextCursor`, `replyHasNext`
   - Click "Load more" trong thread → gọi `GET /comments/42/replies?cursor=<replyNextCursor>&limit=10`, append
5. User gõ comment mới → `POST /posts/:postId/comments` → response có comment đầy đủ `user` info
   - Sort `newest`: prepend vào `comments`
   - Sort `oldest`: append (nhưng làm phức tạp infinite scroll, khuyến nghị mặc định `newest`)
6. User reply → `POST /posts/:postId/comments` với `parentId` → response có comment với `parentId` (đã được flatten nếu cần)
   - Tìm top-level trong state có `id === response.parentId` → push vào `comments[i].replies`
   - Tăng `comments[i].replyCount += 1`

### RTK Query pattern cho Comment (giống Feed)

```js
// Endpoint trong commentApi
getComments: builder.query({
  query: ({ postId, cursor, limit = 10, sort = "newest" }) => ({
    url: `/posts/${postId}/comments`,
    params: { ...(cursor && { cursor }), limit, sort },
  }),
  serializeQueryArgs: ({ endpointName, queryArgs }) => {
    return `${endpointName}-${queryArgs.postId}-${queryArgs.sort}`;
  },
  merge: (currentCache, newItems, { arg }) => {
    if (!arg?.cursor) return newItems; // lần đầu → replace
    currentCache.data.push(...newItems.data);
    currentCache.metadata = newItems.metadata;
  },
  forceRefetch: ({ currentArg, previousArg }) => {
    return currentArg?.cursor !== previousArg?.cursor;
  },
}),

getReplies: builder.query({
  query: ({ commentId, cursor, limit = 10 }) => ({
    url: `/comments/${commentId}/replies`,
    params: { ...(cursor && { cursor }), limit },
  }),
  serializeQueryArgs: ({ endpointName, queryArgs }) => {
    return `${endpointName}-${queryArgs.commentId}`;
  },
  merge: (currentCache, newItems, { arg }) => {
    if (!arg?.cursor) return newItems;
    currentCache.data.push(...newItems.data);
    currentCache.metadata = newItems.metadata;
  },
  forceRefetch: ({ currentArg, previousArg }) => {
    return currentArg?.cursor !== previousArg?.cursor;
  },
}),
```
