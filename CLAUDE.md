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

- Xem / cập nhật profile (chính mình qua `/users/me`)
- **Xem profile user khác** qua `GET /users/:userId/profile` — block-aware (block 2 chiều → 404)
- Fill base profile (onboarding)
- Tìm kiếm user (`GET /users/search?q=...`, top 10, không pagination — dùng cho dropdown autocomplete)
- Upload avatar / cover → Cloudinary
- Xem chi tiết API ở section [API Reference — User Profile](#api-reference--user-profile-fe-integration-guide) bên dưới

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

### ✅ Notification

- **Storage**: MongoDB (Mongoose) — write-heavy, không quan hệ phức tạp → tách khỏi MySQL
- **Cross-DB lookup**: notification lưu `actorId` (BigInt MySQL), khi list trả về thì bulk-fetch `User+Profile` từ MySQL → tránh N+1 (1 Mongo query + 1 MySQL query / page)
- **Realtime**: Socket.io — connection auth qua `handshake.auth.token` (JWT), socket join room `user:{userId}`, BE emit `notification:new` khi tạo noti
- **Best-effort emit**: nếu Mongo persist OK nhưng Socket fail → KHÔNG rollback action gốc (vd react/comment/tag vẫn thành công)
- **Self-action filter** trong `createNotificationService`: skip nếu `actorId === userId` (vd react post của chính mình → không noti)
- **Trigger points** đã wire (5 type):
  - `friend_request`: send friend request → noti receiver
  - `friend_accept`: accept request → noti sender
  - `post_reaction`: react post → noti post owner
  - `comment`: top-level → noti post owner; reply → noti immediate parent owner (lưu `parentUserId` TRƯỚC khi auto-flatten parentId)
  - `post_tag`: create post → noti mọi tagged user; update post → chỉ noti **tag mới** (diff với tag cũ)
- **TODO**: `collab_invite` (cần thêm enum value), `comment_reaction`, `message`
- Xem chi tiết API ở section [API Reference — Notification](#api-reference--notification-fe-integration-guide) bên dưới

### ✅ Chat — Step 2a (Direct 1-1 core) + Step 2b (Message actions)

- **Storage**: MongoDB (Mongoose). 2 collection chính: `Conversation`, `Message`
- **Cross-DB lookup**: bulk-fetch User+Profile từ MySQL (giống pattern Notification) — chống N+1 khi list conversations + messages
- **Atomic createOrGet direct chat**: dùng `directKey` (sorted "minId:maxId") + unique partial index → race-safe khi 2 user click "Message" cùng lúc
- **Block-aware**: nếu A/B có quan hệ block 2 chiều → 403, KHÔNG cho mở chat
- **Information hiding**: user không phải participant của conversation → 404 (giống pattern post detail)
- **Read receipts**: `participants[].lastReadMessageId` là ground truth; `unreadCounts: Map<userIdString, count>` cache cho badge nhanh
- **Multi-tab/device sync**: Socket emit `message:new` cho **TẤT CẢ active participants** (gồm cả sender) — pattern chuẩn của Slack/Messenger
- **Hide conversation** (FB feature): `Conversation.deletedFor[]` soft-hide phía 1 user; gửi message mới auto un-hide cho mọi người
- **Remove for me** (FB feature): `Message.deletedFor[]` ẩn message phía 1 user, người khác vẫn thấy
- **Edit message**: chỉ owner, chỉ áp dụng `type="text"` (image/file/system disallow), set `isEdited=true` + `editedAt`. Nếu là `lastMessage` của conversation → cập nhật preview
- **Recall message** (FB "Unsend for everyone"): chỉ owner, set `isDeleted=true` + cleanup Cloudinary attachments (best-effort). `lastMessage` preview thành "Tin nhắn đã thu hồi". KHÔNG hard-delete để giữ audit + replyTo references
- **Reaction**: reference `ReactionMaster` (MySQL) — 7 reactions cố định (`like/love/care/haha/wow/sad/angry`). Denormalize `keyName` + `icon` vào Message → FE render trực tiếp không cần lookup. 1 user 1 reaction / message; toggle/replace logic
- **Socket events** đã wire (6 events):
  - `message:new`: emit khi gửi message (gồm cả sender)
  - `message:read`: emit khi mark as read → other participants thấy "Đã xem"
  - `message:edited`: emit khi edit thành công, payload kèm full message updated
  - `message:recalled`: emit khi recall, FE re-render với "Tin nhắn đã thu hồi"
  - `message:removed-for-me`: emit **chỉ về self** (multi-tab sync) khi remove for me
  - `message:reaction:updated`: emit reactions array mới sau toggle
- **Pending Step 2c**: group chat (member roles, add/remove, system messages)
- Xem chi tiết API ở section [API Reference — Chat](#api-reference--chat-fe-integration-guide) bên dưới

### 🔲 Schema-only (chưa có API)

- (Tất cả schema MongoDB đã có API)

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

---

## API Reference — Notification (FE Integration Guide)

> Mọi REST endpoint **yêu cầu xác thực** — header `Authorization: Bearer <accessToken>`.
>
> **Base URL**: `http://localhost:5000/api/v1`
> **Realtime**: Socket.io connect tới cùng host (vd `http://localhost:5000`), auth token gửi qua `auth.token` trong handshake.
> **Notification ID**: là Mongo `ObjectId` → string 24 ký tự hex (vd `"662d8a1e3f4b5c001a2e3f4b"`). KHÁC với BigInt id của MySQL entities.

### Realtime — Socket.io contract

#### 1. Connection + Auth

```js
// FE — connect 1 lần khi user đăng nhập, persist socket trong app shell
import { io } from "socket.io-client";

const socket = io("http://localhost:5000", {
  auth: { token: accessToken }, // gửi JWT access token
  withCredentials: true,
  autoConnect: true,
});

socket.on("connect", () => {
  console.log("[Socket] connected", socket.id);
});

socket.on("connect_error", (err) => {
  // err.message = "UNAUTHORIZED: No token provided." | "UNAUTHORIZED: Invalid token."
  console.error("[Socket] auth failed:", err.message);
});
```

**Behavior backend:**
- BE verify JWT từ `handshake.auth.token` ngay khi connect. Sai → reject.
- Sau khi connect OK, socket tự `join("user:{userId}")` — KHÔNG cần FE emit gì.
- Khi access token refresh → FE phải `socket.disconnect()` rồi connect lại với token mới (BE không hot-swap token).

#### 2. Listen event `notification:new`

```js
socket.on("notification:new", (payload) => {
  // payload = formatted notification (shape giống response của GET /notifications)
  // → invalidate badge count + prepend vào list nếu đang mở dropdown
});
```

**Payload shape** (giống item trong `GET /notifications`):

```json
{
  "id": "662d8a1e3f4b5c001a2e3f4b",
  "type": "post_tag",
  "payload": { "postId": "5", "postOwnerId": "7", "preview": "Hôm nay đẹp trời..." },
  "isRead": false,
  "actor": {
    "id": "7",
    "userName": "vuvanchien",
    "displayName": "Vũ Văn Chiến",
    "avatar": "https://res.cloudinary.com/.../avatar.jpg"
  },
  "createdAt": "2026-05-04T10:00:00.000Z"
}
```

#### 3. Recommended FE pattern (RTK Query + Socket listener)

```js
// App shell — mount socket 1 lần, listen → dispatch invalidate
useEffect(() => {
  if (!accessToken) return;
  const socket = io(SOCKET_URL, { auth: { token: accessToken } });

  socket.on("notification:new", (noti) => {
    // 1. Invalidate badge
    dispatch(notificationApi.util.invalidateTags(["UnreadCount"]));

    // 2. Optimistic prepend vào list (nếu user đang mở dropdown noti)
    dispatch(
      notificationApi.util.updateQueryData("getNotifications", undefined, (draft) => {
        draft.data.unshift(noti);
      }),
    );

    // 3. (optional) toast "X reacted to your post"
  });

  return () => socket.disconnect();
}, [accessToken]);
```

---

### Notification types — payload reference

| Type             | Recipient                              | Payload fields                                                                  | Action FE click vào noti           |
|------------------|----------------------------------------|---------------------------------------------------------------------------------|------------------------------------|
| `friend_request` | Receiver của request                   | `requestId` (string)                                                            | Mở `/friends/inbox` highlight item |
| `friend_accept`  | Sender (người gửi request ban đầu)     | `requestId` (string)                                                            | Mở profile actor                   |
| `post_reaction`  | Post owner                             | `postId`, `postOwnerId`, `reactionId`, `reactionKey` (`love`/`like`/...), `reactionIcon` | Mở `/profile/<postOwnerId>` rồi scroll đến post |
| `comment`        | Top-level → post owner; Reply → parent owner | `postId`, `postOwnerId`, `commentId`, `parentId` (null nếu top-level), `content` (truncated 100) | Mở `/profile/<postOwnerId>` rồi scroll đến comment |
| `post_tag`       | Mỗi user được tag (create + tag mới khi update) | `postId`, `postOwnerId`, `preview` (text 100 chars từ block đầu, có thể null) | Mở `/profile/<postOwnerId>` rồi scroll đến post |

**`postOwnerId` trong 3 type post-related**: chủ post (BigInt → string). FE dùng để navigate đến `/profile/:postOwnerId` rồi auto-scroll đến `postId` (UX giống Facebook). Trong case `comment` reply, `postOwnerId` có thể KHÁC recipient (recipient là chủ comment cha) — FE vẫn navigate theo `postOwnerId` để vào đúng feed của chủ post.

**Tương lai (chưa implement, có sẵn trong enum):**
- `comment_reaction`, `post_tag` đã có ✅
- `message`, `group_invite` chưa wire trigger
- `collab_invite` chưa có trong enum — sẽ thêm khi implement collaborator invite flow

---

### Response shape — Notification cơ bản

```json
{
  "id": "662d8a1e3f4b5c001a2e3f4b",
  "type": "post_reaction",
  "payload": {
    "postId": "5",
    "postOwnerId": "9",
    "reactionId": 2,
    "reactionKey": "love",
    "reactionIcon": "❤️"
  },
  "isRead": false,
  "actor": {
    "id": "7",
    "userName": "vuvanchien",
    "displayName": "Vũ Văn Chiến",
    "avatar": "https://res.cloudinary.com/.../avatar.jpg"
  },
  "createdAt": "2026-05-04T10:00:00.000Z"
}
```

- `id`: Mongo ObjectId (string)
- `type`: 1 trong các value của enum (xem bảng trên)
- `payload`: object linh động — shape khác nhau theo `type` → FE switch theo `type` để render đúng
- `actor`: user gây ra action (đã kèm avatar/displayName, FE render ngay không cần fetch thêm)

---

### 1. List notifications (cursor pagination)

```http
GET /api/v1/notifications?cursor=<lastObjectId>&limit=10&unreadOnly=false
```

**Query params:**
| Param        | Default | Range/Type | Mô tả                                                            |
|--------------|---------|------------|------------------------------------------------------------------|
| `cursor`     | —       | ObjectId   | `id` notification cuối đã load. Lần đầu bỏ trống.                |
| `limit`      | `10`    | `1-50`     | Số noti / lần load                                               |
| `unreadOnly` | `false` | bool       | `true` → chỉ trả noti chưa đọc (cho tab "Unread" trên dropdown)  |

**Response 200:**
```json
{
  "message": "Get notifications successfully.",
  "data": [ /* Notification[] */ ],
  "metadata": { "limit": 10, "nextCursor": "662d...", "hasNext": true }
}
```

**Lưu ý FE:**
- Sort `_id DESC` ≈ `createdAt DESC` (Mongo ObjectId có timestamp embed) → noti mới nhất ở đầu
- Lần đầu mở dropdown: `?limit=10` (không cursor)
- Scroll xuống: `?cursor=<nextCursor>&limit=10`
- `hasNext: false` → ngừng gọi

---

### 2. Đếm số noti chưa đọc (cho badge)

```http
GET /api/v1/notifications/unread-count
```

**Response 200:**
```json
{ "message": "Get unread count successfully.", "count": 3 }
```

**Lưu ý FE:**
- Gọi 1 lần khi mount app shell → set badge `🔔 3`
- Sau đó update qua **Socket event** (`notification:new` → +1) thay vì polling
- Khi user click "Mark all as read" → reset về 0 (optimistic) + gọi API real
- Khi user click 1 noti chưa đọc → −1 (optimistic) + gọi API real

---

### 3. Mark 1 notification là đã đọc

```http
PATCH /api/v1/notifications/:id/read
```

`:id` là Mongo ObjectId.

**Response 200:** `{ "message": "Notification marked as read." }`

**Errors:**
| Code | Khi nào                              | Message                                                  |
|------|--------------------------------------|----------------------------------------------------------|
| 403  | Noti không phải của user             | `"You don't have permission to access this notification."` |
| 404  | ID không hợp lệ / noti không tồn tại | `"Notification not found."`                              |

**FE pattern:**
- Khi user click vào item noti → gọi `PATCH /:id/read` → đồng thời redirect đến URL phù hợp với `type` (xem bảng "Action FE click vào noti" ở trên)
- Optimistic: set `isRead: true` trong cache trước khi API về

---

### 4. Mark ALL as read

```http
PATCH /api/v1/notifications/read-all
```

**Response 200:**
```json
{
  "message": "All notifications marked as read.",
  "modifiedCount": 5
}
```

`modifiedCount`: số noti vừa được mark — FE dùng để hiện toast "5 notifications marked as read" (optional).

---

### 5. Delete notification

```http
DELETE /api/v1/notifications/:id
```

**Response 200:** `{ "message": "Notification deleted successfully." }`

**Errors:** giống endpoint 3 (403/404).

> Hard delete — không có "trash". User xóa là mất luôn.

---

### Edge cases & business rules cho FE

| Tình huống | Backend xử lý | FE nên làm |
|---|---|---|
| User self-action (vd react post của mình) | `createNotificationService` skip → không tạo noti | — (không nhận event) |
| Mongo persist OK nhưng Socket emit fail | Action gốc vẫn thành công, noti có trong DB | User refresh thì thấy noti — không cần xử lý |
| User refresh access token | Socket cũ vẫn dùng token cũ | Disconnect + reconnect socket với token mới |
| User mở 2 tab | Cả 2 tab đều join `user:{userId}` → cả 2 nhận event | Đồng bộ cache qua RTK Query (mỗi tab tự update) |
| User click noti tới post đã bị xóa | API `GET /posts/:id` trả 404 | Toast "Post no longer exists" + xóa noti khỏi list |
| Spam reaction (react → unreact → react) | Mỗi lần react sẽ trigger noti mới | BE chưa dedupe — TODO v2 thêm "noti gộp" (vd "X và 5 người khác reacted") |
| Comment trên reply (parentId là 1 reply) | BE auto-flatten parentId, nhưng noti vẫn về **immediate parent owner** (lưu `parentUserId` trước khi flatten) | Bình thường — đúng intent user |

---

### Suggested FE state structure (RTK Query)

```js
// notificationApi
getNotifications: builder.query({
  query: ({ cursor, limit = 10, unreadOnly = false }) => ({
    url: "/notifications",
    params: { ...(cursor && { cursor }), limit, unreadOnly },
  }),
  providesTags: ["Notifications"],
  serializeQueryArgs: ({ endpointName, queryArgs }) =>
    `${endpointName}-${queryArgs.unreadOnly}`,
  merge: (currentCache, newItems, { arg }) => {
    if (!arg?.cursor) return newItems;
    currentCache.data.push(...newItems.data);
    currentCache.metadata = newItems.metadata;
  },
  forceRefetch: ({ currentArg, previousArg }) =>
    currentArg?.cursor !== previousArg?.cursor,
}),

getUnreadCount: builder.query({
  query: () => "/notifications/unread-count",
  providesTags: ["UnreadCount"],
}),

markAsRead: builder.mutation({
  query: (id) => ({ url: `/notifications/${id}/read`, method: "PATCH" }),
  // optimistic: update cache trực tiếp, không cần invalidate full list
  async onQueryStarted(id, { dispatch, queryFulfilled }) {
    const patch = dispatch(
      notificationApi.util.updateQueryData("getNotifications", undefined, (draft) => {
        const target = draft.data.find((n) => n.id === id);
        if (target && !target.isRead) target.isRead = true;
      }),
    );
    try { await queryFulfilled; }
    catch { patch.undo(); }
  },
  invalidatesTags: ["UnreadCount"],
}),

markAllAsRead: builder.mutation({
  query: () => ({ url: "/notifications/read-all", method: "PATCH" }),
  invalidatesTags: ["Notifications", "UnreadCount"],
}),

deleteNotification: builder.mutation({
  query: (id) => ({ url: `/notifications/${id}`, method: "DELETE" }),
  invalidatesTags: ["Notifications", "UnreadCount"],
}),
```

### Suggested UI flow

```
1. App shell mount → connect Socket.io với accessToken
2. Header bell icon → query getUnreadCount → render badge
3. Click bell → mở dropdown → query getNotifications (limit=10)
4. Dropdown có 2 tab "All" / "Unread" → tab "Unread" gọi với unreadOnly=true
5. Click 1 noti:
   - Mark as read (optimistic) + decrement badge
   - Navigate theo type (xem bảng "Action FE click vào noti")
6. Click "Mark all as read" → reset badge về 0
7. Khi nhận `notification:new` qua Socket:
   - Tăng badge +1
   - Prepend vào list (nếu dropdown đang mở)
   - (optional) Toast với actor.displayName + type
```

---

## API Reference — User Profile (FE Integration Guide)

> Mọi endpoint **yêu cầu xác thực** — header `Authorization: Bearer <accessToken>`.
>
> **Base URL**: `http://localhost:5000/api/v1`
> **BigInt → string**: `id` trả về dạng string.

### 1. Search user (autocomplete)

```http
GET /api/v1/users/search?q=<keyword>
```

**Query:**
| Param | Required | Mô tả |
|---|---|---|
| `q` | ✅ | Keyword (tìm theo `userName` HOẶC `displayName`, contains) |

**Response 200:**
```json
{
  "message": "Users found",
  "listUsers": [
    {
      "userId": "5",
      "userName": "vuvanchien",
      "displayName": "Vũ Văn Chiến",
      "avatar": "https://res.cloudinary.com/.../avatar.jpg"
    }
  ]
}
```

**Errors:**
| Code | Khi nào | Message |
|---|---|---|
| 400 | Thiếu `q` hoặc rỗng | `"Please enter username!"` |

**Lưu ý FE:**
- Hardcode top 10 result, không có pagination → phù hợp **dropdown autocomplete**, KHÔNG phù hợp dedicated search results page (sẽ thêm cursor sau nếu cần)
- KHÔNG trả về current user (BE đã filter)
- Empty result vẫn 200 với `listUsers: []` + message `"User not found"` (không phải error)
- **Pattern khuyến nghị**: debounce 300ms → call API → render dropdown

---

### 2. Xem profile user khác (hoặc chính mình)

```http
GET /api/v1/users/:userId/profile
```

**Response 200:**
```json
{
  "message": "Get user profile successfully.",
  "data": {
    "id": "5",
    "userName": "vuvanchien",
    "displayName": "Vũ Văn Chiến",
    "avatar": "https://res.cloudinary.com/.../avatar.jpg",
    "coverImage": "https://res.cloudinary.com/.../cover.jpg",
    "gender": "male",
    "birthDay": "2002-01-15T00:00:00.000Z",
    "bio": "Hello world",
    "location": "Hanoi, Vietnam",
    "website": "https://example.com",
    "createdAt": "2025-01-01T..."
  }
}
```

**Errors:**
| Code | Khi nào | Message |
|---|---|---|
| 404 | User không tồn tại / đã xóa | `"User not found."` |
| 404 | Có quan hệ block 2 chiều (mình block hoặc bị block) | `"User not found."` |

**Lưu ý FE:**
- KHÔNG trả `email`, `phoneNumber`, `role`, `status` (private fields chỉ xuất hiện ở `/users/me`)
- **Block-aware = 404** (information hiding) → FE handle như user không tồn tại, KHÔNG hiển thị thông báo "Bạn đã bị block" để tránh leak info
- Endpoint này dùng được cho **CHÍNH MÌNH** (`userId === currentUserId`) — FE simplify chỉ cần 1 endpoint cho mọi profile page (nhưng nếu cần email/role thì vẫn dùng `/me`)
- Pattern: 2 query song song trên ProfilePage:
  - `GET /users/:userId/profile` → render header (avatar, cover, name, bio...)
  - `GET /users/:userId/friend-status` → render button friend
  - Tách riêng để invalidate cache độc lập (mutation friend chỉ cần invalidate `FriendStatus` tag, profile data không refetch)

---

### Suggested ProfilePage flow (RTK Query)

```js
// userApi
getUserProfile: builder.query({
  query: (userId) => `/users/${userId}/profile`,
  providesTags: (result, error, userId) => [
    { type: "UserProfile", id: userId }
  ],
}),

searchUsers: builder.query({
  query: (q) => `/users/search?q=${encodeURIComponent(q)}`,
}),

// ProfilePage component
function ProfilePage() {
  const { userId } = useParams();
  const { data: profile, isLoading } = useGetUserProfileQuery(userId);
  const { data: status } = useGetFriendStatusQuery(userId);

  if (isLoading) return <Spinner />;
  if (!profile) return <NotFound />; // 404 từ API

  return (
    <>
      <CoverImage src={profile.coverImage} />
      <Avatar src={profile.avatar} />
      <h1>{profile.displayName}</h1>
      <FriendButton status={status} userId={userId} />
      <Bio text={profile.bio} />
      <UserPosts userId={userId} /> {/* gọi GET /posts?userId=... */}
    </>
  );
}
```

---

## API Reference — Chat (FE Integration Guide)

> Mọi REST endpoint **yêu cầu xác thực** — header `Authorization: Bearer <accessToken>`.
>
> **Base URL**: `http://localhost:5000/api/v1`
> **Realtime**: dùng cùng Socket.io instance với Notification (xem [section Notification](#api-reference--notification-fe-integration-guide) cho connection setup).
> **ID format**:
>   - `conversationId` / `messageId` / `lastReadMessageId` / `replyTo.id`: Mongo ObjectId — string 24 hex chars
>   - `userId` / `senderId` / `peer.id`: BigInt MySQL → string

### Status — Direct chat 1-1 (2a) + Message actions (2b)

Đã có:
- **Step 2a**: createOrGet direct conversation, list conversations, list messages, send message, mark as read
- **Step 2b**: edit message, recall (delete for everyone), remove for me, toggle reaction (FB-like)

Pending **Step 2c**: group chat (create group, add/remove members, member roles, group avatar/name, system messages).

---

### Realtime — Socket.io events

> Socket connection đã thiết lập từ Notification — KHÔNG cần connect lại.

#### Listen `message:new`

```js
socket.on("message:new", ({ conversationId, message }) => {
  // 1. Nếu user đang mở conversation này → append message vào danh sách + auto mark-as-read
  // 2. Nếu KHÔNG mở → tăng unreadCount của conversation đó +1, update lastMessage preview
  // 3. Nếu sender là chính mình (multi-tab sync) → dedupe by message.id rồi render
});
```

**Payload shape:**
```json
{
  "conversationId": "662e8a1e3f4b5c001a2e3f4b",
  "message": {
    "id": "662f9b2e4c5d6f001b3f4c5d",
    "conversationId": "662e8a1e3f4b5c001a2e3f4b",
    "type": "text",
    "content": "Hello!",
    "attachments": [],
    "replyTo": null,
    "reactions": [],
    "sender": {
      "id": "7",
      "userName": "vuvanchien",
      "displayName": "Vũ Văn Chiến",
      "avatar": "https://res.cloudinary.com/.../avatar.jpg"
    },
    "isEdited": false,
    "isDeleted": false,
    "systemMeta": null,
    "createdAt": "2026-05-06T10:00:00.000Z",
    "updatedAt": "2026-05-06T10:00:00.000Z"
  }
}
```

**Lưu ý quan trọng:**
- BE emit cho **TẤT CẢ active participants gồm cả sender** → multi-tab/device sync. FE cần dedupe by `message.id` nếu vừa optimistic add từ POST response.
- Sender info có sẵn trong payload — FE không cần fetch thêm.

#### Listen `message:read`

```js
socket.on("message:read", ({ conversationId, userId, lastReadMessageId }) => {
  // userId = người vừa mark as read (KHÁC current user)
  // → Update UI "Đã xem" cho mọi message có _id <= lastReadMessageId
});
```

**Payload shape:**
```json
{
  "conversationId": "662e8a1e3f4b5c001a2e3f4b",
  "userId": "8",
  "lastReadMessageId": "662f9b2e4c5d6f001b3f4c5d"
}
```

> Event này KHÔNG emit cho user vừa mark (chỉ cho người khác).

#### Listen `message:edited`

```js
socket.on("message:edited", ({ conversationId, message }) => {
  // Replace message trong state theo message.id
  // Render "(đã chỉnh sửa)" cạnh timestamp khi message.isEdited=true
});
```

**Payload shape:** `{ conversationId, message: <full Message shape giống message:new> }`

> Emit cho **TẤT CẢ active participants** gồm cả sender (multi-tab sync).

#### Listen `message:recalled`

```js
socket.on("message:recalled", ({ conversationId, messageId }) => {
  // Tìm message theo id trong state, set isDeleted=true (hoặc refetch list)
  // Render "Tin nhắn đã thu hồi" thay cho content/attachments
});
```

**Payload shape:** `{ conversationId, messageId }` (không kèm full message — FE tự update flag)

> Emit cho **TẤT CẢ active participants** gồm cả sender.

#### Listen `message:removed-for-me`

```js
socket.on("message:removed-for-me", ({ conversationId, messageId }) => {
  // Remove message khỏi UI của me (multi-tab sync)
});
```

**Payload shape:** `{ conversationId, messageId }`

> Emit **CHỈ cho user vừa remove** (KHÔNG cho người khác — họ vẫn thấy message bình thường).

#### Listen `message:reaction:updated`

```js
socket.on("message:reaction:updated", ({ conversationId, messageId, reactions }) => {
  // Replace `reactions` array của message tương ứng
  // FE render cluster icon (vd ❤️ 😂 with count)
});
```

**Payload shape:**
```json
{
  "conversationId": "662e8a1e3f4b5c001a2e3f4b",
  "messageId": "662f9b2e4c5d6f001b3f4c5d",
  "reactions": [
    {
      "userId": "8",
      "reactionId": 2,
      "keyName": "love",
      "icon": "❤️",
      "createdAt": "..."
    }
  ]
}
```

> Emit cho **TẤT CẢ active participants**.

---

### Response shape — Conversation cơ bản

```json
{
  "id": "662e8a1e3f4b5c001a2e3f4b",
  "type": "direct",
  "peer": {
    "id": "8",
    "userName": "hoanguyen",
    "displayName": "Hoa Nguyễn",
    "avatar": "https://res.cloudinary.com/.../avatar.jpg"
  },
  "group": null,
  "lastMessage": {
    "id": "662f9b2e4c5d6f001b3f4c5d",
    "type": "text",
    "content": "Hello!",
    "senderId": "7",
    "createdAt": "2026-05-06T10:00:00.000Z"
  },
  "lastMessageAt": "2026-05-06T10:00:00.000Z",
  "unreadCount": 3,
  "isMuted": false,
  "lastReadMessageId": "662f9a1d3b2c1e001a2e3f4a",
  "createdAt": "2026-05-01T...",
  "updatedAt": "2026-05-06T10:00:00.000Z"
}
```

**FE notes:**
- `peer` chỉ có cho `type: "direct"` (luôn là user kia, không phải mình) → render avatar + name của họ
- `peer: null` cho group → render `group.name` + `group.avatar`
- `lastMessage.content` đã truncate 100 chars + thêm icon cho image/file (vd `"🖼️ 3 ảnh"`, `"📎 report.pdf"`)
- `unreadCount`: badge cho conversation
- `isMuted`: nếu `mutedUntil > now` → ẩn notification badge nhưng vẫn count

### Response shape — Message cơ bản

```json
{
  "id": "662f9b2e4c5d6f001b3f4c5d",
  "conversationId": "662e8a1e3f4b5c001a2e3f4b",
  "type": "text",
  "content": "Reply lại nè",
  "attachments": [],
  "replyTo": {
    "id": "662f9a1d3b2c1e001a2e3f4a",
    "type": "text",
    "content": "Tin nhắn gốc",
    "isDeleted": false,
    "sender": { "id": "8", "userName": "...", "displayName": "Hoa", "avatar": "..." }
  },
  "reactions": [
    {
      "userId": "8",
      "reactionId": 2,
      "keyName": "love",
      "icon": "❤️",
      "createdAt": "..."
    }
  ],
  "sender": {
    "id": "7",
    "userName": "vuvanchien",
    "displayName": "Vũ Văn Chiến",
    "avatar": "https://res.cloudinary.com/.../avatar.jpg"
  },
  "isEdited": false,
  "editedAt": null,
  "isDeleted": false,
  "systemMeta": null,
  "createdAt": "2026-05-06T10:00:00.000Z",
  "updatedAt": "2026-05-06T10:00:00.000Z"
}
```

**Cho message với attachments:**
```json
{
  "type": "image",
  "content": "Ảnh chụp hôm qua",
  "attachments": [
    {
      "type": "image",
      "url": "https://res.cloudinary.com/.../photo1.jpg",
      "fileName": "photo1.jpg",
      "mimeType": "image/jpeg",
      "size": 234567,
      "width": 1920,
      "height": 1080
    },
    /* ... thêm ảnh */
  ]
}
```

**Cho message bị recall (Step 2b):** `isDeleted: true`, `content: null`, `attachments: []` → FE render "Tin nhắn đã thu hồi".

---

### 1. Create or Get direct conversation

```http
POST /api/v1/conversations/direct
Content-Type: application/json
```

**Idempotent** — nếu đã có direct chat giữa current user & target → trả về luôn, không tạo trùng.

**Body:**
```json
{ "otherUserId": "5" }
```

**Response 200:**
```json
{
  "message": "Conversation ready.",
  "data": { /* Conversation shape */ }
}
```

**Errors:**
| Code | Khi nào | Message |
|---|---|---|
| 400 | `otherUserId === currentUserId` | `"Cannot start conversation with yourself."` |
| 400 | `otherUserId` không phải numeric | `"Invalid otherUserId"` (Zod) |
| 403 | Có quan hệ block 2 chiều | `"Cannot start conversation — user is blocked."` |
| 404 | Other user không tồn tại / đã xóa | `"User not found."` |

**FE pattern:**
- Click "Message" trên profile user → `POST /conversations/direct { otherUserId }` → nhận `conversationId` → navigate `/chat/<conversationId>`
- KHÔNG cần check trước có conversation chưa — endpoint tự xử lý

---

### 2. List conversations

```http
GET /api/v1/conversations?cursor=<lastMessageAtIso>&limit=20
```

**Query params:**
| Param | Default | Range/Type | Mô tả |
|---|---|---|---|
| `cursor` | — | ISO timestamp | `lastMessageAt` của conversation cuối cùng đã load. Lần đầu bỏ trống. |
| `limit` | `20` | `1-50` | Số conversation / lần load |

**Response 200:**
```json
{
  "message": "Get conversations successfully.",
  "data": [ /* Conversation[] */ ],
  "metadata": {
    "limit": 20,
    "nextCursor": "2026-05-06T10:00:00.000Z",
    "hasNext": true
  }
}
```

**Lưu ý FE:**
- Sort `lastMessageAt DESC` — conversation có message mới nhất ở đầu
- Conversation user đã "Hide" sẽ KHÔNG xuất hiện (BE filter `deletedFor`)
- Conversation chưa có message: `lastMessage: null` nhưng vẫn có `lastMessageAt = createdAt` để sort
- Khi nhận `message:new` từ Socket → invalidate cache hoặc patch state thủ công (move conversation lên top + update lastMessage + tăng unreadCount nếu KHÔNG đang mở)

---

### 3. List messages của 1 conversation

```http
GET /api/v1/conversations/:id/messages?cursor=<messageObjectId>&limit=30
```

**Query params:**
| Param | Default | Range/Type | Mô tả |
|---|---|---|---|
| `cursor` | — | ObjectId | `id` message cuối cùng đã load (tức message cũ nhất hiện có). Lần đầu bỏ trống. |
| `limit` | `30` | `1-100` | Số message / lần load |

**Response 200:**
```json
{
  "message": "Get messages successfully.",
  "data": [ /* Message[] sort _id DESC */ ],
  "metadata": { "limit": 30, "nextCursor": "...", "hasNext": true }
}
```

**Errors:** `404 "Conversation not found."` (cũng dùng khi user không phải participant — information hiding).

**Lưu ý FE:**
- BE trả `_id DESC` (newest first). Khi render UI thường reverse để hiển thị oldest → newest từ trên xuống
- Pagination: scroll lên top → load thêm cũ hơn = `?cursor=<id message cũ nhất hiện có>`
- Message đã "Remove for me" sẽ KHÔNG xuất hiện (BE filter `deletedFor`)
- Message bị recall: `isDeleted: true`, content/attachments rỗng — FE render "Tin nhắn đã thu hồi"

---

### 4. Send message

```http
POST /api/v1/conversations/:id/messages
Content-Type: multipart/form-data
```

**Body (multipart):**
| Field | Type | Required | Mô tả |
|---|---|---|---|
| `content` | string | (xem refine) | Text message, max 5000 chars |
| `replyTo` | string | optional | `id` message muốn reply (phải cùng conversation, chưa deleted) |
| `attachments` | file[] | (xem refine) | Tối đa 10 file. Hiện tại Cloudinary chỉ allow `jpg/png/jpeg/webp/mp4/mov` |

**Refine**: PHẢI có ít nhất 1 trong (`content` không rỗng, `attachments` ≥ 1 file). Cả 2 rỗng → 400.

**Response 201:**
```json
{
  "message": "Message sent.",
  "data": { /* Message shape đầy đủ */ }
}
```

**Errors:**
| Code | Khi nào | Message |
|---|---|---|
| 400 | Cả content và attachments rỗng | `"Message content or attachments required."` |
| 400 | content > 5000 chars | Validation error |
| 400 | replyTo không phải ObjectId hợp lệ | Validation error |
| 403 | User đã rời group (Step 2c) | `"You are not a member of this conversation."` |
| 404 | Conversation không tồn tại / không phải participant | `"Conversation not found."` |
| 404 | replyTo không tồn tại / khác conversation / đã deleted | `"Reply target not found."` |

**Lưu ý FE:**
- BE tự detect `type` từ attachments: tất cả image/video → `"image"`, có file thường → `"file"`, không attachment → `"text"`
- Sau response 201, BE đã emit `message:new` qua Socket cho all participants (gồm cả sender) → có thể skip optimistic update
- Hoặc optimistic add ngay với temp id, dedupe khi nhận socket event
- File upload bị giới hạn format hiện tại — bạn cần file PDF/doc thì báo BE mở rộng `cloudinary.js` config

---

### 5. Mark as read

```http
PATCH /api/v1/conversations/:id/read
```

Mark mọi message trong conversation là đã đọc → reset `unreadCount = 0` + update `lastReadMessageId` của participant.

**Response 200:**
```json
{
  "message": "Marked as read.",
  "lastReadMessageId": "662f9b2e4c5d6f001b3f4c5d"
}
```

`lastReadMessageId: null` nếu conversation chưa có message nào.

**Errors:** `404 "Conversation not found."`

**FE pattern:**
- Khi user mở conversation HOẶC focus trở lại window khi đang mở conversation → call API
- Optimistic: set `unreadCount = 0` ngay
- Sau response, BE emit `message:read` cho participants khác → họ thấy "Đã xem" cập nhật

---

### 6. Edit message

```http
PUT /api/v1/messages/:id
Content-Type: application/json
```

**Body:**
```json
{ "content": "Nội dung sửa lại" }
```

**Permission**: chỉ **owner** (sender) sửa được.

**Response 200:**
```json
{
  "message": "Message edited.",
  "data": { /* full Message shape, isEdited=true, editedAt set */ }
}
```

**Errors:**
| Code | Khi nào | Message |
|---|---|---|
| 400 | content rỗng / > 5000 chars (Zod) | Validation error |
| 400 | message.type !== "text" (image/file/system) | `"Cannot edit non-text message."` |
| 403 | Không phải owner | `"You don't have permission to edit this message."` |
| 403 | User đã rời group (Step 2c) | `"You are not a member of this conversation."` |
| 404 | Message không tồn tại / đã recall / không phải participant | `"Message not found."` |

**Lưu ý FE:**
- Chỉ **text** message edit được — image/file/system reject 400
- Sau response, BE đã emit `message:edited` Socket → tab khác auto update
- Nếu message này là `lastMessage` của conversation → BE tự update `Conversation.lastMessage.content` preview
- KHÔNG cho clear sạch content qua edit (`min: 1` ở Zod) — muốn xóa tin nhắn thì recall

---

### 7. Recall message (Unsend for everyone)

```http
DELETE /api/v1/messages/:id
```

**Permission**: chỉ **owner** thu hồi được.

**Response 200:**
```json
{
  "message": "Message recalled.",
  "id": "662f9b2e4c5d6f001b3f4c5d",
  "isDeleted": true,
  "deletedAt": "2026-05-06T11:00:00.000Z"
}
```

**Errors:**
| Code | Khi nào | Message |
|---|---|---|
| 400 | type === "system" | `"Cannot recall system message."` |
| 403 | Không phải owner | `"You don't have permission to recall this message."` |
| 404 | Đã recall trước đó / không tồn tại / không phải participant | `"Message not found."` |

**Behavior backend:**
- Set `isDeleted=true` + `deletedAt=now` (KHÔNG hard-delete để giữ audit + replyTo references)
- Cleanup Cloudinary attachments (best-effort — không rollback nếu fail)
- Nếu là `lastMessage` của conversation → preview thành `"Tin nhắn đã thu hồi"`
- Emit `message:recalled` cho all active participants

**Lưu ý FE:**
- Sau API call success, hoặc nhận socket `message:recalled` → FE set `isDeleted=true` cho message tương ứng → render "Tin nhắn đã thu hồi"
- Message bị recall vẫn còn trong list (FE không filter) — FE chỉ thay đổi UI render
- Reply tới message bị recall vẫn hiển thị, FE check `replyTo.isDeleted` để render "(tin nhắn gốc đã bị thu hồi)"
- KHÔNG có time limit hiện tại — owner thu hồi anytime

---

### 8. Remove for me

```http
DELETE /api/v1/messages/:id/for-me
```

**Permission**: bất kỳ **participant** (không cần là sender). Khác với recall, action này chỉ ẩn phía mình.

**Response 200:**
```json
{
  "message": "Message removed for you.",
  "id": "662f9b2e4c5d6f001b3f4c5d",
  "removed": true
}
```

**Errors:**
| Code | Khi nào | Message |
|---|---|---|
| 404 | Message không tồn tại / không phải participant | `"Message not found."` |

**Behavior backend:**
- `$addToSet` userId vào `Message.deletedFor[]` — idempotent
- Emit `message:removed-for-me` **CHỈ về self** (multi-tab sync) — KHÔNG ảnh hưởng người khác

**Lưu ý FE:**
- Chỉ cần optimistic remove khỏi list của me — message vẫn ở đó với người khác
- Multi-tab: tab khác của me cũng nhận event và remove khỏi UI → sync tự động
- List API tự filter `deletedFor: { $ne: me }` → reload page cũng không thấy

---

### 9. Toggle reaction (FB-like)

```http
POST /api/v1/messages/:id/reactions
Content-Type: application/json
```

**Body:**
```json
{ "reactionId": 2 }
```

`reactionId` là `id` trong `ReactionMaster` (1-7) — giống pattern post reaction. 7 loại: `like (1), love (2), care (3), haha (4), wow (5), sad (6), angry (7)` (kiểm tra DB seed cho chính xác).

**Permission**: bất kỳ **participant** (kể cả tự react message của mình — giống FB).

**Response 200:**
```json
{
  "message": "Reaction updated.",
  "messageId": "662f9b2e4c5d6f001b3f4c5d",
  "action": "added",
  "reactions": [
    {
      "userId": "7",
      "reactionId": 2,
      "keyName": "love",
      "icon": "❤️",
      "createdAt": "2026-05-06T..."
    }
  ]
}
```

**`action` field:**
| Value | Khi nào |
|---|---|
| `"added"` | User chưa react message này → thêm mới |
| `"replaced"` | User đã react với reactionId khác → đổi sang reactionId mới |
| `"removed"` | User click lại cùng reactionId → toggle off |

**Errors:**
| Code | Khi nào | Message |
|---|---|---|
| 400 | reactionId không tồn tại trong ReactionMaster | `"Invalid reaction."` |
| 400 | reactionId không phải number / negative (Zod) | Validation error |
| 400 | message.type === "system" | `"Cannot react to system message."` |
| 404 | Message không tồn tại / đã recall / không phải participant | `"Message not found."` |

**Behavior backend:**
- 1 user 1 reaction / message — service filter array khi đổi
- Denormalize `keyName` + `icon` từ ReactionMaster vào `Message.reactions[]` → FE render trực tiếp không cần lookup master
- Emit `message:reaction:updated` cho all active participants với `reactions` array mới (có cả icon)

**Lưu ý FE:**
- 1 endpoint duy nhất xử lý toggle/replace/add — FE không cần phân biệt
- Click cùng emoji 2 lần = remove (toggle UX phổ biến)
- Click emoji khác = thay thế (1 user chỉ có 1 reaction trên message)
- FE cần load `ReactionMaster` 1 lần (qua endpoint riêng nếu có, hoặc hardcode 7 reactions ở config) để render reaction picker; sau đó `reactions[]` trong Message đã có sẵn `icon` để render bubble

---

### Edge cases & business rules cho FE

| Tình huống | Backend xử lý | FE nên làm |
|---|---|---|
| 2 user cùng click "Message" tạo direct cùng lúc | `directKey` unique partial index → request 2 fail E11000, BE catch + findOne lấy doc đã tạo | — (transparent với FE) |
| User block đối phương rồi mở chat cũ | 403 khi gửi message? KHÔNG — block check chỉ ở `createOrGetDirect`. Các action sau vẫn cho phép (TODO) | Optional: hide chat của user bị block trong list |
| User Hide conversation rồi đối phương gửi message | BE `$pull deletedFor` → conversation un-hide cho mọi người | Conversation quay lại list của user đã hide |
| User mở 2 tab chat cùng conversation | Cả 2 tab nhận `message:new`, `message:read` | Dedupe `message:new` by message.id |
| Mark-as-read khi không có message nào | Trả `lastReadMessageId: null` (không lỗi) | Chỉ update UI nếu cần |
| Send message tới conversation user vừa bị xóa khỏi group (2c) | `myParticipant.leftAt` → 403 | Reload conversation list (BE đã đẩy member ra) |
| User tag/mention trong message | Chưa support — content là plain text | TODO v2 |
| Edit message image/file | 400 — chỉ cho edit text | Disable button "Edit" trên message non-text |
| Recall message có attachments | BE auto destroy Cloudinary file (best-effort) | Refresh hoặc trust socket event update UI |
| Recall message là `lastMessage` của conversation | BE auto update `lastMessage.content = "Tin nhắn đã thu hồi"` | Conversation list preview tự cập nhật khi nhận `message:recalled` (refetch hoặc patch state) |
| Reply tới message bị recall | `replyTo.isDeleted = true` trong response, content KHÔNG ẩn (giữ context) | Render preview "(tin nhắn gốc đã bị thu hồi)" theo flag isDeleted |
| Multi-tab: edit/recall ở tab A | Cả 2 tab nhận `message:edited` / `message:recalled` (gồm cả sender) | Replace message theo id |
| Multi-tab: remove for me ở tab A | Tab B của me nhận `message:removed-for-me` | Remove khỏi UI; tab khác user vẫn thấy message bình thường |
| User toggle reaction nhanh liên tục | Mỗi lần emit socket → có thể spam events | Debounce reaction button click 200-300ms ở FE |
| Reaction trên message của chính mình | Cho phép (giống FB) | Render bình thường |

---

### Suggested FE state structure (RTK Query)

```js
// chatApi.js
getConversations: builder.query({
  query: ({ cursor, limit = 20 }) => ({
    url: "/conversations",
    params: { ...(cursor && { cursor }), limit },
  }),
  providesTags: ["Conversations"],
  serializeQueryArgs: ({ endpointName }) => endpointName,
  merge: (currentCache, newItems, { arg }) => {
    if (!arg?.cursor) return newItems;
    currentCache.data.push(...newItems.data);
    currentCache.metadata = newItems.metadata;
  },
  forceRefetch: ({ currentArg, previousArg }) =>
    currentArg?.cursor !== previousArg?.cursor,
}),

getMessages: builder.query({
  query: ({ conversationId, cursor, limit = 30 }) => ({
    url: `/conversations/${conversationId}/messages`,
    params: { ...(cursor && { cursor }), limit },
  }),
  serializeQueryArgs: ({ endpointName, queryArgs }) =>
    `${endpointName}-${queryArgs.conversationId}`,
  merge: (currentCache, newItems, { arg }) => {
    if (!arg?.cursor) return newItems;
    currentCache.data.push(...newItems.data); // append cũ hơn (load more lên)
    currentCache.metadata = newItems.metadata;
  },
  forceRefetch: ({ currentArg, previousArg }) =>
    currentArg?.cursor !== previousArg?.cursor,
}),

createOrGetDirect: builder.mutation({
  query: (otherUserId) => ({
    url: "/conversations/direct",
    method: "POST",
    body: { otherUserId },
  }),
  invalidatesTags: ["Conversations"],
}),

sendMessage: builder.mutation({
  query: ({ conversationId, formData }) => ({
    url: `/conversations/${conversationId}/messages`,
    method: "POST",
    body: formData, // FormData chứa content + attachments[]
  }),
  // KHÔNG cần invalidate — Socket message:new sẽ tự update
}),

markAsRead: builder.mutation({
  query: (conversationId) => ({
    url: `/conversations/${conversationId}/read`,
    method: "PATCH",
  }),
  // Optimistic update unreadCount = 0
  async onQueryStarted(conversationId, { dispatch, queryFulfilled }) {
    const patch = dispatch(
      chatApi.util.updateQueryData("getConversations", undefined, (draft) => {
        const conv = draft.data.find((c) => c.id === conversationId);
        if (conv) conv.unreadCount = 0;
      }),
    );
    try { await queryFulfilled; }
    catch { patch.undo(); }
  },
}),

// ===== Step 2b — Message actions =====

editMessage: builder.mutation({
  query: ({ messageId, content }) => ({
    url: `/messages/${messageId}`,
    method: "PUT",
    body: { content },
  }),
  // KHÔNG cần invalidate — Socket "message:edited" tự update mọi tab
}),

recallMessage: builder.mutation({
  query: (messageId) => ({
    url: `/messages/${messageId}`,
    method: "DELETE",
  }),
  // KHÔNG cần invalidate — Socket "message:recalled" tự update
}),

removeMessageForMe: builder.mutation({
  query: (messageId) => ({
    url: `/messages/${messageId}/for-me`,
    method: "DELETE",
  }),
  // Optimistic remove khỏi getMessages cache
  async onQueryStarted(messageId, { dispatch, queryFulfilled, getState }) {
    // Tìm message trong cache để biết conversationId
    const allCaches = chatApi.util.selectInvalidatedBy(getState(), [
      { type: "Messages" },
    ]);
    // Patch tất cả getMessages cache có chứa messageId này
    const patches = allCaches.map(({ originalArgs }) =>
      dispatch(
        chatApi.util.updateQueryData("getMessages", originalArgs, (draft) => {
          draft.data = draft.data.filter((m) => m.id !== messageId);
        }),
      ),
    );
    try { await queryFulfilled; }
    catch { patches.forEach((p) => p.undo()); }
  },
}),

toggleReaction: builder.mutation({
  query: ({ messageId, reactionId }) => ({
    url: `/messages/${messageId}/reactions`,
    method: "POST",
    body: { reactionId },
  }),
  // KHÔNG cần invalidate — Socket "message:reaction:updated" tự update
}),
```

### Suggested UI flow

```
1. App shell mount → Socket đã connect (từ Notification setup)
   → listen ALL chat events: message:new, message:read, message:edited,
     message:recalled, message:removed-for-me, message:reaction:updated
   → patch RTK cache (getMessages + getConversations) thủ công

2. Sidebar conversation list:
   - Query getConversations → render với badge unreadCount
   - Click 1 conversation → navigate /chat/<id>

3. Chat page (/chat/:id):
   - Query getMessages (limit=30) → render reverse (oldest top, newest bottom)
   - Khi mở: gọi markAsRead → reset badge của conversation này
   - Scroll lên top → load thêm: getMessages(cursor=<id message cũ nhất>)
   - Input gõ + chọn file → sendMessage (FormData)

4. Khi nhận `message:new` qua Socket:
   - Nếu đang mở chat đúng conversationId → append message vào cuối + auto markAsRead
   - Nếu đang ở chat khác / sidebar → update lastMessage + tăng unreadCount của conversation đó

5. Khi nhận `message:read` qua Socket:
   - Update UI "Đã xem" cho mọi message của me có _id <= lastReadMessageId

6. "Message" button trên profile user:
   - Click → createOrGetDirect → nhận conversationId → navigate /chat/<id>
```

