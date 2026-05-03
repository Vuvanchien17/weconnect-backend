import prisma from "../config/prisma.js";

// ============ HELPERS ============

// Include shape dùng chung khi fetch FriendRequest kèm user info 2 phía
const friendRequestInclude = {
  sender: {
    select: {
      id: true,
      userName: true,
      profile: { select: { displayName: true, avatar: true } },
    },
  },
  receiver: {
    select: {
      id: true,
      userName: true,
      profile: { select: { displayName: true, avatar: true } },
    },
  },
};

// Chuẩn hóa shape user (dùng cho cả friendship và friend request)
const formatUser = (u) => ({
  id: u.id,
  userName: u.userName,
  displayName: u.profile?.displayName || u.userName,
  avatar: u.profile?.avatar || null,
});

const formatFriendRequest = (r) => ({
  id: r.id,
  status: r.status,
  sender: formatUser(r.sender),
  receiver: formatUser(r.receiver),
  createdAt: r.createdAt,
  respondedAt: r.respondedAt,
});

// ============ SEND FRIEND REQUEST ============
// Logic:
// 1. Self-check (không gửi cho chính mình)
// 2. Receiver tồn tại + chưa bị xóa
// 3. Bulk check 4 điều kiện song song:
//    - Có block 2 chiều?      → reject 403
//    - Đã là bạn?             → reject 400
//    - Đã có outgoing pending? → reject 400
//    - Có incoming pending?   → AUTO-MATCH (tự accept request cũ)
// 4. Tạo request mới
//
// Return:
// - { type: "request_sent", request: {...} }    — tạo request mới
// - { type: "auto_matched", friendship: {...} } — đã có incoming, accept luôn
export const sendFriendRequestService = async (senderId, receiverId) => {
  const sender = BigInt(senderId);
  const receiver = BigInt(receiverId);

  // 1. Self-check
  if (sender === receiver) {
    const err = new Error("Cannot send friend request to yourself.");
    err.status = 400;
    throw err;
  }

  // 2. Receiver tồn tại
  const receiverUser = await prisma.user.findUnique({
    where: { id: receiver },
    select: { id: true, isDeleted: true },
  });
  if (!receiverUser || receiverUser.isDeleted) {
    const err = new Error("User not found.");
    err.status = 404;
    throw err;
  }

  // 3. Bulk check song song
  const [block, friendship, outgoing, incoming] = await Promise.all([
    // Block 2 chiều — chỉ cần 1 row tồn tại là chặn
    prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: sender, blockedId: receiver },
          { blockerId: receiver, blockedId: sender },
        ],
      },
    }),
    prisma.friendship.findFirst({
      where: { userId: sender, friendId: receiver },
    }),
    prisma.friendRequest.findFirst({
      where: { senderId: sender, receiverId: receiver, status: "pending" },
    }),
    prisma.friendRequest.findFirst({
      where: { senderId: receiver, receiverId: sender, status: "pending" },
    }),
  ]);

  if (block) {
    const err = new Error("Cannot send friend request — user is blocked.");
    err.status = 403;
    throw err;
  }
  if (friendship) {
    const err = new Error("Already friends.");
    err.status = 400;
    throw err;
  }
  if (outgoing) {
    const err = new Error("Friend request already sent.");
    err.status = 400;
    throw err;
  }

  // 4. AUTO-MATCH: receiver đã gửi cho mình từ trước → accept luôn
  if (incoming) {
    const result = await acceptFriendRequestService(incoming.id, sender);
    return { type: "auto_matched", ...result };
  }

  // 5. Tạo request mới
  const request = await prisma.friendRequest.create({
    data: {
      senderId: sender,
      receiverId: receiver,
      status: "pending",
    },
    include: friendRequestInclude,
  });

  return { type: "request_sent", request: formatFriendRequest(request) };
};

// ============ ACCEPT FRIEND REQUEST ============
// Chỉ receiver mới được accept. Transaction 3 op:
// 1. Update request status=accepted, respondedAt
// 2. Insert Friendship(senderId, receiverId)
// 3. Insert Friendship(receiverId, senderId)
//
// Return: { request, friend: {...other user info...} }
export const acceptFriendRequestService = async (requestId, currentUserId) => {
  const reqId = BigInt(requestId);
  const currentUser = BigInt(currentUserId);

  const request = await prisma.friendRequest.findUnique({
    where: { id: reqId },
    include: friendRequestInclude,
  });

  if (!request) {
    const err = new Error("Friend request not found.");
    err.status = 404;
    throw err;
  }
  if (request.status !== "pending") {
    const err = new Error("Friend request already processed.");
    err.status = 400;
    throw err;
  }
  if (request.receiverId !== currentUser) {
    const err = new Error(
      "You don't have permission to accept this request.",
    );
    err.status = 403;
    throw err;
  }

  await prisma.$transaction([
    prisma.friendRequest.update({
      where: { id: reqId },
      data: { status: "accepted", respondedAt: new Date() },
    }),
    prisma.friendship.create({
      data: { userId: request.senderId, friendId: request.receiverId },
    }),
    prisma.friendship.create({
      data: { userId: request.receiverId, friendId: request.senderId },
    }),
  ]);

  // Trả về user kia (sender từ góc nhìn của người accept)
  return {
    request: { ...formatFriendRequest(request), status: "accepted" },
    friend: formatUser(request.sender),
  };
};

// ============ REJECT FRIEND REQUEST ============
// Chỉ receiver mới được reject. Update status=rejected (giữ history).
export const rejectFriendRequestService = async (requestId, currentUserId) => {
  const reqId = BigInt(requestId);
  const currentUser = BigInt(currentUserId);

  const request = await prisma.friendRequest.findUnique({
    where: { id: reqId },
    select: { id: true, status: true, receiverId: true },
  });

  if (!request) {
    const err = new Error("Friend request not found.");
    err.status = 404;
    throw err;
  }
  if (request.status !== "pending") {
    const err = new Error("Friend request already processed.");
    err.status = 400;
    throw err;
  }
  if (request.receiverId !== currentUser) {
    const err = new Error(
      "You don't have permission to reject this request.",
    );
    err.status = 403;
    throw err;
  }

  await prisma.friendRequest.update({
    where: { id: reqId },
    data: { status: "rejected", respondedAt: new Date() },
  });
};

// ============ CANCEL FRIEND REQUEST ============
// Chỉ sender mới được hủy lời mời mình đã gửi (khi receiver chưa xử lý).
// Khác với reject: cancel xóa hẳn record, sender có thể gửi lại sau.
export const cancelFriendRequestService = async (requestId, currentUserId) => {
  const reqId = BigInt(requestId);
  const currentUser = BigInt(currentUserId);

  const request = await prisma.friendRequest.findUnique({
    where: { id: reqId },
    select: { id: true, status: true, senderId: true },
  });

  if (!request) {
    const err = new Error("Friend request not found.");
    err.status = 404;
    throw err;
  }
  if (request.status !== "pending") {
    const err = new Error("Cannot cancel — request already processed.");
    err.status = 400;
    throw err;
  }
  if (request.senderId !== currentUser) {
    const err = new Error(
      "You don't have permission to cancel this request.",
    );
    err.status = 403;
    throw err;
  }

  await prisma.friendRequest.delete({ where: { id: reqId } });
};

// ============ INBOX (lời mời đến mình, pending) ============
// Cursor pagination, order by id DESC (newest first)
export const getInboxService = async ({ userId, cursor, limit }) => {
  const take = Math.min(Math.max(Number(limit) || 10, 1), 50);

  const where = {
    receiverId: BigInt(userId),
    status: "pending",
  };

  const requests = await prisma.friendRequest.findMany({
    where,
    take: take + 1,
    ...(cursor && {
      cursor: { id: BigInt(cursor) },
      skip: 1,
    }),
    orderBy: { id: "desc" },
    include: friendRequestInclude,
  });

  const hasNext = requests.length > take;
  const items = hasNext ? requests.slice(0, take) : requests;
  const nextCursor = hasNext ? items[items.length - 1].id.toString() : null;

  return {
    data: items.map(formatFriendRequest),
    metadata: { limit: take, nextCursor, hasNext },
  };
};

// ============ OUTBOX (lời mời mình đã gửi, pending) ============
export const getOutboxService = async ({ userId, cursor, limit }) => {
  const take = Math.min(Math.max(Number(limit) || 10, 1), 50);

  const where = {
    senderId: BigInt(userId),
    status: "pending",
  };

  const requests = await prisma.friendRequest.findMany({
    where,
    take: take + 1,
    ...(cursor && {
      cursor: { id: BigInt(cursor) },
      skip: 1,
    }),
    orderBy: { id: "desc" },
    include: friendRequestInclude,
  });

  const hasNext = requests.length > take;
  const items = hasNext ? requests.slice(0, take) : requests;
  const nextCursor = hasNext ? items[items.length - 1].id.toString() : null;

  return {
    data: items.map(formatFriendRequest),
    metadata: { limit: take, nextCursor, hasNext },
  };
};

// ============ GET FRIENDS LIST ============
// List bạn của 1 user (mình hoặc người khác). Cursor pagination theo Friendship.
// Nhờ schema lưu 2 chiều (A,B) và (B,A) → query đơn giản: WHERE userId=X.
// Sort: id DESC (bạn mới kết bạn xuất hiện trước)
//
// Note: dùng composite cursor `{ userId_friendId: { userId, friendId } }` vì
// Friendship dùng composite PK, không có id autoincrement.
export const getFriendsService = async ({ userId, cursor, limit }) => {
  const take = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const targetUserId = BigInt(userId);

  // Verify user tồn tại
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, isDeleted: true },
  });
  if (!user || user.isDeleted) {
    const err = new Error("User not found.");
    err.status = 404;
    throw err;
  }

  // Cursor format: "<friendId>" — vì userId trong cursor cố định = targetUserId
  const where = { userId: targetUserId };

  const friendships = await prisma.friendship.findMany({
    where,
    take: take + 1,
    ...(cursor && {
      cursor: {
        userId_friendId: {
          userId: targetUserId,
          friendId: BigInt(cursor),
        },
      },
      skip: 1,
    }),
    orderBy: [{ createdAt: "desc" }, { friendId: "desc" }],
    include: {
      friend: {
        select: {
          id: true,
          userName: true,
          profile: { select: { displayName: true, avatar: true } },
        },
      },
    },
  });

  const hasNext = friendships.length > take;
  const items = hasNext ? friendships.slice(0, take) : friendships;
  const nextCursor = hasNext
    ? items[items.length - 1].friendId.toString()
    : null;

  return {
    data: items.map((f) => ({
      ...formatUser(f.friend),
      friendsSince: f.createdAt,
    })),
    metadata: { limit: take, nextCursor, hasNext },
  };
};

// ============ UNFRIEND ============
// Transaction xóa 2 row Friendship — đảm bảo không có trạng thái "A là bạn B
// nhưng B không là bạn A".
export const unfriendService = async (currentUserId, otherUserId) => {
  const me = BigInt(currentUserId);
  const other = BigInt(otherUserId);

  if (me === other) {
    const err = new Error("Invalid operation.");
    err.status = 400;
    throw err;
  }

  // Check là bạn không
  const friendship = await prisma.friendship.findUnique({
    where: { userId_friendId: { userId: me, friendId: other } },
  });
  if (!friendship) {
    const err = new Error("You are not friends with this user.");
    err.status = 404;
    throw err;
  }

  // Transaction xóa cả 2 row
  await prisma.$transaction([
    prisma.friendship.delete({
      where: { userId_friendId: { userId: me, friendId: other } },
    }),
    prisma.friendship.delete({
      where: { userId_friendId: { userId: other, friendId: me } },
    }),
  ]);
};

// ============ GET FRIEND STATUS ============
// Trả về 1 trong các state để FE render đúng button:
//   - "self"               : nhìn chính mình
//   - "blocked_by_me"      : mình đã block họ
//   - "blocked_by_them"    : họ đã block mình
//   - "friends"            : đã là bạn
//   - "pending_outgoing"   : mình đã gửi, chờ họ
//   - "pending_incoming"   : họ đã gửi, mình chưa xử lý
//   - "none"               : không quan hệ gì
//
// Bulk check 4 query song song để giảm latency.
// Thứ tự kiểm tra: self → block (cả 2 chiều) → friends → pending → none
export const getFriendStatusService = async (currentUserId, otherUserId) => {
  const me = BigInt(currentUserId);
  const other = BigInt(otherUserId);

  if (me === other) {
    return { status: "self" };
  }

  // Verify other user tồn tại
  const otherUser = await prisma.user.findUnique({
    where: { id: other },
    select: { id: true, isDeleted: true },
  });
  if (!otherUser || otherUser.isDeleted) {
    const err = new Error("User not found.");
    err.status = 404;
    throw err;
  }

  const [iBlockedThem, theyBlockedMe, friendship, outgoing, incoming] =
    await Promise.all([
      prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: me, blockedId: other } },
      }),
      prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: other, blockedId: me } },
      }),
      prisma.friendship.findUnique({
        where: { userId_friendId: { userId: me, friendId: other } },
      }),
      prisma.friendRequest.findFirst({
        where: { senderId: me, receiverId: other, status: "pending" },
        select: { id: true },
      }),
      prisma.friendRequest.findFirst({
        where: { senderId: other, receiverId: me, status: "pending" },
        select: { id: true },
      }),
    ]);

  if (iBlockedThem) return { status: "blocked_by_me" };
  if (theyBlockedMe) return { status: "blocked_by_them" };
  if (friendship) {
    return { status: "friends", friendsSince: friendship.createdAt };
  }
  if (outgoing) {
    return { status: "pending_outgoing", requestId: outgoing.id.toString() };
  }
  if (incoming) {
    return { status: "pending_incoming", requestId: incoming.id.toString() };
  }
  return { status: "none" };
};

// ============ BLOCK USER ============
// Logic:
// 1. Self-check (không block chính mình)
// 2. Check blocked user tồn tại
// 3. Check chưa block trước đó (tránh duplicate constraint error)
// 4. Transaction 3 op:
//    - Insert UserBlock
//    - Delete Friendship 2 chiều (nếu là bạn)
//    - Delete pending FriendRequest 2 chiều (nếu có)
//
// Note: KHÔNG cascade delete tag/comment/reaction giữa 2 người (giữ history).
// FE tự ẩn các tương tác đó dựa trên friend-status.
export const blockUserService = async (blockerId, blockedId) => {
  const me = BigInt(blockerId);
  const other = BigInt(blockedId);

  if (me === other) {
    const err = new Error("Cannot block yourself.");
    err.status = 400;
    throw err;
  }

  // Check blocked user tồn tại
  const blockedUser = await prisma.user.findUnique({
    where: { id: other },
    select: {
      id: true,
      isDeleted: true,
      userName: true,
      profile: { select: { displayName: true, avatar: true } },
    },
  });
  if (!blockedUser || blockedUser.isDeleted) {
    const err = new Error("User not found.");
    err.status = 404;
    throw err;
  }

  // Check đã block chưa (idempotent — tránh throw constraint error xấu xí)
  const existing = await prisma.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId: me, blockedId: other } },
  });
  if (existing) {
    const err = new Error("User is already blocked.");
    err.status = 400;
    throw err;
  }

  // Transaction: tạo UserBlock + clean Friendship + pending FriendRequest 2 chiều
  await prisma.$transaction([
    prisma.userBlock.create({
      data: { blockerId: me, blockedId: other },
    }),
    prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId: me, friendId: other },
          { userId: other, friendId: me },
        ],
      },
    }),
    prisma.friendRequest.deleteMany({
      where: {
        status: "pending",
        OR: [
          { senderId: me, receiverId: other },
          { senderId: other, receiverId: me },
        ],
      },
    }),
  ]);

  return { blocked: formatUser(blockedUser) };
};

// ============ UNBLOCK USER ============
// Đơn giản: xóa UserBlock. Sau đó user bị block có thể gửi request lại bình thường.
// Không tự khôi phục Friendship cũ — phải kết bạn lại từ đầu.
export const unblockUserService = async (blockerId, blockedId) => {
  const me = BigInt(blockerId);
  const other = BigInt(blockedId);

  const block = await prisma.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId: me, blockedId: other } },
  });
  if (!block) {
    const err = new Error("User is not blocked.");
    err.status = 404;
    throw err;
  }

  await prisma.userBlock.delete({
    where: { blockerId_blockedId: { blockerId: me, blockedId: other } },
  });
};

// ============ LIST BLOCKS (mình đã block ai) ============
// Cursor pagination — composite cursor theo blockedId (vì blockerId cố định = me).
// Sort: createdAt DESC (block mới nhất xuất hiện trước).
export const getBlocksService = async ({ userId, cursor, limit }) => {
  const take = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const me = BigInt(userId);

  const where = { blockerId: me };

  const blocks = await prisma.userBlock.findMany({
    where,
    take: take + 1,
    ...(cursor && {
      cursor: {
        blockerId_blockedId: {
          blockerId: me,
          blockedId: BigInt(cursor),
        },
      },
      skip: 1,
    }),
    orderBy: [{ createdAt: "desc" }, { blockedId: "desc" }],
    include: {
      blocked: {
        select: {
          id: true,
          userName: true,
          profile: { select: { displayName: true, avatar: true } },
        },
      },
    },
  });

  const hasNext = blocks.length > take;
  const items = hasNext ? blocks.slice(0, take) : blocks;
  const nextCursor = hasNext
    ? items[items.length - 1].blockedId.toString()
    : null;

  return {
    data: items.map((b) => ({
      ...formatUser(b.blocked),
      blockedAt: b.createdAt,
    })),
    metadata: { limit: take, nextCursor, hasNext },
  };
};

// ============ HELPERS dùng cho Privacy filter trong Feed ============
//
// Lấy mảng BigInt friend IDs của 1 user.
// Friendship lưu 2 chiều (A,B) và (B,A) → query đơn giản WHERE userId=X.
// Note: với user có >1000 bạn, nên cache Redis 5 phút thay vì query mỗi request.
export const getFriendIds = async (userId) => {
  const friendships = await prisma.friendship.findMany({
    where: { userId: BigInt(userId) },
    select: { friendId: true },
  });
  return friendships.map((f) => f.friendId);
};

// Lấy mảng BigInt user IDs có quan hệ block với current user (CẢ 2 CHIỀU):
// - Người mình đã block
// - Người đã block mình
// → Trả về union của 2 set để filter feed loại post của những user này.
export const getBlockListIds = async (userId) => {
  const me = BigInt(userId);
  const [iBlocked, blockedMe] = await Promise.all([
    prisma.userBlock.findMany({
      where: { blockerId: me },
      select: { blockedId: true },
    }),
    prisma.userBlock.findMany({
      where: { blockedId: me },
      select: { blockerId: true },
    }),
  ]);

  // Union để dedupe (mặc dù 2 chiều khó có overlap thực tế)
  const set = new Set();
  iBlocked.forEach((b) => set.add(b.blockedId.toString()));
  blockedMe.forEach((b) => set.add(b.blockerId.toString()));
  return Array.from(set).map((id) => BigInt(id));
};
