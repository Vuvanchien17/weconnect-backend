import mongoose from "mongoose";
import Conversation from "../models/mongoDB/conversation.model.js";
import Message from "../models/mongoDB/message.model.js";
import prisma from "../config/prisma.js";
import { emitToUser } from "../config/socket.js";
import { cloudinary } from "../config/cloudinary.js";

// ============ HELPERS ============

const formatUser = (u) =>
  u
    ? {
        id: u.id.toString(),
        userName: u.userName,
        displayName: u.profile?.displayName || u.userName,
        avatar: u.profile?.avatar || null,
      }
    : null;

// Bulk-fetch user info từ MySQL — tránh N+1 khi list messages/conversations
const buildUserMap = async (userIds) => {
  if (!userIds || userIds.length === 0) return new Map();
  const distinctIds = [...new Set(userIds.map((id) => id.toString()))];
  const users = await prisma.user.findMany({
    where: { id: { in: distinctIds.map((id) => BigInt(id)) } },
    select: {
      id: true,
      userName: true,
      profile: { select: { displayName: true, avatar: true } },
    },
  });
  return new Map(users.map((u) => [u.id.toString(), u]));
};

// Truncate string để hiển thị preview lastMessage
const truncate = (str, n) =>
  str && str.length > n ? str.substring(0, n) + "..." : str;

// Build lastMessage preview từ message vừa tạo. Cover đủ 4 type.
const buildPreviewFromMessage = (msg) => {
  let content = null;
  if (msg.type === "text") content = truncate(msg.content, 100);
  else if (msg.type === "image")
    content = msg.content
      ? truncate(msg.content, 100)
      : `🖼️ ${msg.attachments?.length > 1 ? `${msg.attachments.length} ảnh` : "Hình ảnh"}`;
  else if (msg.type === "file")
    content =
      msg.content || `📎 ${msg.attachments?.[0]?.fileName || "Tệp đính kèm"}`;
  else content = msg.content; // system message
  return {
    messageId: msg._id,
    type: msg.type,
    content,
    senderId: msg.senderId,
    createdAt: msg.createdAt,
  };
};

// Đọc unreadCounts cho 1 user — handle cả lean (plain obj) và non-lean (Map)
const getUnreadCount = (conv, userIdStr) => {
  const u = conv.unreadCounts;
  if (!u) return 0;
  if (u instanceof Map) return u.get(userIdStr) || 0;
  return u[userIdStr] || 0;
};

// Format conversation cho FE — kèm peer (direct) hoặc group info, unread count, mute state
const formatConversation = (conv, currentUserIdStr, peerUser) => {
  const myParticipant = conv.participants.find(
    (p) => p.userId.toString() === currentUserIdStr,
  );
  const isMuted =
    myParticipant?.mutedUntil &&
    new Date(myParticipant.mutedUntil) > new Date();

  return {
    id: conv._id.toString(),
    type: conv.type,
    peer: peerUser ? formatUser(peerUser) : null, // null cho group
    group: conv.group
      ? {
          name: conv.group.name,
          description: conv.group.description || null,
          avatar: conv.group.avatar || null,
        }
      : null,
    lastMessage: conv.lastMessage
      ? {
          id: conv.lastMessage.messageId?.toString(),
          type: conv.lastMessage.type,
          content: conv.lastMessage.content,
          senderId: conv.lastMessage.senderId.toString(),
          createdAt: conv.lastMessage.createdAt,
        }
      : null,
    lastMessageAt: conv.lastMessageAt,
    unreadCount: getUnreadCount(conv, currentUserIdStr),
    isMuted: !!isMuted,
    lastReadMessageId: myParticipant?.lastReadMessageId?.toString() || null,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
};

// Format message cho FE — bao gồm sender, replyTo (kèm sender của reply target), reactions
const formatMessage = (msg, sender, replyToMsg, replyToSender) => ({
  id: msg._id.toString(),
  conversationId: msg.conversationId.toString(),
  type: msg.type,
  content: msg.isDeleted ? null : msg.content,
  attachments: msg.isDeleted
    ? []
    : (msg.attachments || []).map((a) => ({
        type: a.type,
        url: a.url,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        width: a.width,
        height: a.height,
      })),
  replyTo: replyToMsg
    ? {
        id: replyToMsg._id.toString(),
        type: replyToMsg.type,
        content: replyToMsg.isDeleted ? null : replyToMsg.content,
        isDeleted: replyToMsg.isDeleted,
        sender: replyToSender ? formatUser(replyToSender) : null,
      }
    : null,
  reactions: (msg.reactions || []).map((r) => ({
    userId: r.userId.toString(),
    reactionId: r.reactionId,
    keyName: r.keyName,
    icon: r.icon,
    createdAt: r.createdAt,
  })),
  sender: sender ? formatUser(sender) : null,
  isEdited: msg.isEdited,
  editedAt: msg.editedAt,
  isDeleted: msg.isDeleted,
  systemMeta: msg.systemMeta || null,
  createdAt: msg.createdAt,
  updatedAt: msg.updatedAt,
});

// ============ CREATE OR GET DIRECT CONVERSATION ============
// Idempotent — nếu đã có direct chat giữa me & other → return; nếu chưa → create.
//
// Atomic upsert qua findOneAndUpdate + $setOnInsert: tránh race condition khi 2 user
// click "Message" cùng lúc tạo 2 conversation duplicate.
//
// Block check: nếu me/other có quan hệ block 2 chiều → 403 (cấm chat).
export const createOrGetDirectConversationService = async (
  currentUserId,
  otherUserId,
) => {
  const me = BigInt(currentUserId);
  const other = BigInt(otherUserId);

  if (me === other) {
    const err = new Error("Cannot start conversation with yourself.");
    err.status = 400;
    throw err;
  }

  // 1. Check other user tồn tại
  const otherUser = await prisma.user.findUnique({
    where: { id: other },
    select: { id: true, isDeleted: true },
  });
  if (!otherUser || otherUser.isDeleted) {
    const err = new Error("User not found.");
    err.status = 404;
    throw err;
  }

  // 2. Check block 2 chiều
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: me, blockedId: other },
        { blockerId: other, blockedId: me },
      ],
    },
    select: { blockerId: true },
  });
  if (block) {
    const err = new Error("Cannot start conversation — user is blocked.");
    err.status = 403;
    throw err;
  }

  // 3. Sort 2 IDs để query deterministic — đảm bảo cùng cặp user luôn cho cùng directKey
  // dù ai gọi createOrGet trước.
  const sortedIds = [me, other].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const directKey = `${sortedIds[0].toString()}:${sortedIds[1].toString()}`;

  // 4. Atomic upsert qua directKey (single-value path → Mongo infer được).
  // Trước đây dùng `$all` trên `participants.userId` báo lỗi "matched twice".
  //
  // Race-safe nhờ unique partial index — request thứ 2 đồng thời sẽ throw E11000,
  // catch và findOne lại để lấy doc đã được request trước tạo.
  const now = new Date();
  let conversation;
  try {
    conversation = await Conversation.findOneAndUpdate(
      { type: "direct", directKey },
      {
        $setOnInsert: {
          type: "direct",
          directKey,
          participants: [{ userId: sortedIds[0] }, { userId: sortedIds[1] }],
          lastMessageAt: now,
          unreadCounts: {},
        },
        // Nếu me đã hide conversation này trước đó → un-hide khi mở lại
        $pull: { deletedFor: me },
      },
      { upsert: true, new: true, lean: true },
    );
  } catch (err) {
    if (err.code === 11000) {
      // Race: request khác vừa upsert xong giữa lúc check & insert
      conversation = await Conversation.findOne({
        type: "direct",
        directKey,
      }).lean();
      if (!conversation) throw err;
    } else {
      throw err;
    }
  }

  // 5. Bulk-fetch peer info để FE render header chat ngay
  const peerUser = await prisma.user.findUnique({
    where: { id: other },
    select: {
      id: true,
      userName: true,
      profile: { select: { displayName: true, avatar: true } },
    },
  });

  return formatConversation(conversation, me.toString(), peerUser);
};

// ============ LIST CONVERSATIONS (cursor pagination) ============
// Sort: lastMessageAt DESC. Cursor: ISO timestamp string.
// Filter:
//   - Chỉ conversation user là participant
//   - Loại bỏ conversation user đã "Hide" (trong deletedFor)
//
// Bulk-fetch peer users (chỉ cho direct chat) để tránh N+1.
export const listConversationsService = async ({ userId, cursor, limit }) => {
  const take = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const me = BigInt(userId);

  const where = {
    "participants.userId": me,
    deletedFor: { $ne: me },
  };

  if (cursor) {
    const cursorDate = new Date(cursor);
    if (Number.isNaN(cursorDate.getTime())) {
      const err = new Error("Invalid cursor.");
      err.status = 400;
      throw err;
    }
    where.lastMessageAt = { $lt: cursorDate };
  }

  const conversations = await Conversation.find(where)
    .sort({ lastMessageAt: -1 })
    .limit(take + 1)
    .lean();

  const hasNext = conversations.length > take;
  const items = hasNext ? conversations.slice(0, take) : conversations;
  const nextCursor =
    hasNext && items[items.length - 1].lastMessageAt
      ? items[items.length - 1].lastMessageAt.toISOString()
      : null;

  // Bulk-fetch peer users cho tất cả direct chat
  const peerUserIds = new Set();
  for (const conv of items) {
    if (conv.type === "direct") {
      const peer = conv.participants.find(
        (p) => p.userId.toString() !== me.toString(),
      );
      if (peer) peerUserIds.add(peer.userId.toString());
    }
  }
  const userMap =
    peerUserIds.size > 0
      ? await buildUserMap([...peerUserIds].map((id) => BigInt(id)))
      : new Map();

  const data = items.map((conv) => {
    let peerUser = null;
    if (conv.type === "direct") {
      const peer = conv.participants.find(
        (p) => p.userId.toString() !== me.toString(),
      );
      if (peer) peerUser = userMap.get(peer.userId.toString());
    }
    return formatConversation(conv, me.toString(), peerUser);
  });

  return {
    data,
    metadata: { limit: take, nextCursor, hasNext },
  };
};

// ============ LIST MESSAGES trong 1 conversation (cursor pagination) ============
// Sort: _id DESC (newest first) — UX chat list, FE prepend khi load thêm.
// Cursor: ObjectId string. Lần đầu bỏ trống.
//
// Filter:
//   - User phải là participant (404 nếu không phải, information hiding)
//   - Loại bỏ message user đã "Remove for me"
//
// Bulk-fetch sender + replyTo + replyTo's sender — chống N+1.
export const listMessagesService = async ({
  conversationId,
  userId,
  cursor,
  limit,
}) => {
  const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const me = BigInt(userId);

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  // Verify user là participant
  const conv = await Conversation.findOne({
    _id: conversationId,
    "participants.userId": me,
  })
    .select("_id")
    .lean();
  if (!conv) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  const where = {
    conversationId: conv._id,
    deletedFor: { $ne: me },
  };

  if (cursor) {
    if (!mongoose.Types.ObjectId.isValid(cursor)) {
      const err = new Error("Invalid cursor.");
      err.status = 400;
      throw err;
    }
    where._id = { $lt: new mongoose.Types.ObjectId(cursor) };
  }

  const messages = await Message.find(where)
    .sort({ _id: -1 })
    .limit(take + 1)
    .lean();

  const hasNext = messages.length > take;
  const items = hasNext ? messages.slice(0, take) : messages;
  const nextCursor = hasNext ? items[items.length - 1]._id.toString() : null;

  // Collect replyTo target messages (1 query) — KHÔNG fetch nested replies
  const replyToIds = items.filter((m) => m.replyTo).map((m) => m.replyTo);
  const replyToMessages =
    replyToIds.length > 0
      ? await Message.find({ _id: { $in: replyToIds } }).lean()
      : [];
  const replyToMap = new Map(
    replyToMessages.map((m) => [m._id.toString(), m]),
  );

  // Collect tất cả sender IDs (cả của message + của replyTo target)
  const senderIds = new Set();
  for (const m of items) senderIds.add(m.senderId.toString());
  for (const m of replyToMessages) senderIds.add(m.senderId.toString());

  const userMap = await buildUserMap(
    [...senderIds].map((id) => BigInt(id)),
  );

  const data = items.map((m) => {
    const replyToMsg = m.replyTo ? replyToMap.get(m.replyTo.toString()) : null;
    return formatMessage(
      m,
      userMap.get(m.senderId.toString()),
      replyToMsg,
      replyToMsg ? userMap.get(replyToMsg.senderId.toString()) : null,
    );
  });

  return {
    data,
    metadata: { limit: take, nextCursor, hasNext },
  };
};

// ============ SEND MESSAGE ============
// Logic:
// 1. Validate conversationId, content/attachments không cùng rỗng
// 2. Verify user là participant ACTIVE (chưa leftAt)
// 3. Validate replyTo (nếu có): phải tồn tại + cùng conversation + chưa deleted
// 4. Detect message type từ attachments (image/video → "image", file → "file", text)
// 5. Insert Message
// 6. Update Conversation atomic: lastMessage, lastMessageAt, $inc unreadCounts cho
//    OTHER participants, $pull deletedFor (un-hide cho mọi người)
// 7. Emit Socket "message:new" cho ALL participants (gồm cả sender — multi-tab sync)
//
// Note: Mongo không transaction giữa 2 collection (cần replica set). Edge case rare:
// Message insert OK nhưng Conversation update fail → conversation stale. Acceptable
// cho MVP — user reload sẽ thấy message đúng (trong list messages).
export const sendMessageService = async ({
  conversationId,
  senderId,
  content,
  attachments = [],
  replyTo = null,
}) => {
  const me = BigInt(senderId);

  // 1. Validate input
  if (!content && attachments.length === 0) {
    const err = new Error("Message content or attachments required.");
    err.status = 400;
    throw err;
  }

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  // 2. Verify membership + active (chưa rời group)
  const conv = await Conversation.findOne({
    _id: conversationId,
    "participants.userId": me,
  });
  if (!conv) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  const myParticipant = conv.participants.find(
    (p) => p.userId.toString() === me.toString(),
  );
  if (myParticipant?.leftAt) {
    const err = new Error("You are not a member of this conversation.");
    err.status = 403;
    throw err;
  }

  // 3. Validate replyTo
  let replyToMsg = null;
  if (replyTo) {
    replyToMsg = await Message.findOne({
      _id: replyTo,
      conversationId: conv._id, // PHẢI cùng conversation (anti-injection)
      isDeleted: false,
    });
    if (!replyToMsg) {
      const err = new Error("Reply target not found.");
      err.status = 404;
      throw err;
    }
  }

  // 4. Detect type
  let type = "text";
  if (attachments.length > 0) {
    const allMedia = attachments.every(
      (a) => a.type === "image" || a.type === "video",
    );
    type = allMedia ? "image" : "file";
  }

  // 5. Create Message
  const message = await Message.create({
    conversationId: conv._id,
    senderId: me,
    type,
    content: content || null,
    attachments,
    replyTo: replyToMsg?._id || null,
  });

  // 6. Update Conversation: lastMessage cache + unreadCounts cho người khác + un-hide
  const otherParticipantIds = conv.participants
    .filter(
      (p) => p.userId.toString() !== me.toString() && !p.leftAt,
    )
    .map((p) => p.userId);

  const update = {
    $set: {
      lastMessage: buildPreviewFromMessage(message),
      lastMessageAt: message.createdAt,
    },
    // Un-hide cho mọi participant (FB pattern — gửi tin = wake conversation lên)
    $pull: {
      deletedFor: { $in: conv.participants.map((p) => p.userId) },
    },
  };

  // $inc unreadCounts cho người khác (KHÔNG inc cho me)
  if (otherParticipantIds.length > 0) {
    update.$inc = {};
    for (const uid of otherParticipantIds) {
      update.$inc[`unreadCounts.${uid.toString()}`] = 1;
    }
  }

  await Conversation.updateOne({ _id: conv._id }, update);

  // 7. Bulk-fetch sender info để emit kèm + format response
  const userIdsToFetch = [me];
  if (replyToMsg) userIdsToFetch.push(replyToMsg.senderId);
  const userMap = await buildUserMap(userIdsToFetch);

  const formatted = formatMessage(
    message.toObject(),
    userMap.get(me.toString()),
    replyToMsg ? replyToMsg.toObject() : null,
    replyToMsg ? userMap.get(replyToMsg.senderId.toString()) : null,
  );

  // 8. Emit Socket cho ALL participants (gồm me — multi-tab sync)
  const allActiveIds = conv.participants
    .filter((p) => !p.leftAt)
    .map((p) => p.userId);

  for (const uid of allActiveIds) {
    emitToUser(uid, "message:new", {
      conversationId: conv._id.toString(),
      message: formatted,
    });
  }

  return formatted;
};

// ============ MARK AS READ ============
// Update lastReadMessageId của participant + reset unreadCounts.{me} = 0.
// Latest message được xác định bằng max _id trong conversation.
//
// Emit "message:read" cho người khác để FE update read receipt UI ("Đã xem").
export const markAsReadService = async ({ conversationId, userId }) => {
  const me = BigInt(userId);

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  const conv = await Conversation.findOne({
    _id: conversationId,
    "participants.userId": me,
  }).lean();
  if (!conv) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  // Find latest message (max _id)
  const latestMessage = await Message.findOne({ conversationId: conv._id })
    .sort({ _id: -1 })
    .select("_id")
    .lean();

  if (!latestMessage) {
    return { lastReadMessageId: null };
  }

  // Update participant's lastReadMessageId + reset unreadCounts.{me}
  await Conversation.updateOne(
    { _id: conv._id, "participants.userId": me },
    {
      $set: {
        "participants.$.lastReadMessageId": latestMessage._id,
        [`unreadCounts.${me.toString()}`]: 0,
      },
    },
  );

  // Emit "message:read" cho participants khác để hiển thị "Đã xem"
  const otherIds = conv.participants
    .filter(
      (p) => p.userId.toString() !== me.toString() && !p.leftAt,
    )
    .map((p) => p.userId);

  for (const uid of otherIds) {
    emitToUser(uid, "message:read", {
      conversationId: conv._id.toString(),
      userId: me.toString(),
      lastReadMessageId: latestMessage._id.toString(),
    });
  }

  return { lastReadMessageId: latestMessage._id.toString() };
};

// ============================================================
// STEP 2b — MESSAGE ACTIONS
// edit / recall / remove for me / toggle reaction
// ============================================================

// ============ HELPER: load message + verify membership ============
// Dùng chung cho 4 service action — load message, conversation, check participant.
// Trả { message (mongoose doc), conv (mongoose doc), myParticipant }.
// Nếu user KHÔNG phải participant → throw 404 (information hiding).
const loadMessageForAction = async (messageId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    const err = new Error("Message not found.");
    err.status = 404;
    throw err;
  }

  const message = await Message.findById(messageId);
  if (!message) {
    const err = new Error("Message not found.");
    err.status = 404;
    throw err;
  }

  const conv = await Conversation.findById(message.conversationId);
  if (!conv) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  const myParticipant = conv.participants.find(
    (p) => p.userId.toString() === userId.toString(),
  );
  if (!myParticipant) {
    // User không phải participant → 404 thay vì 403 để tránh leak info
    const err = new Error("Message not found.");
    err.status = 404;
    throw err;
  }

  return { message, conv, myParticipant };
};

// ============ EDIT MESSAGE ============
// Chỉ owner sửa được. Chỉ áp dụng cho type="text" (image/file/system disallow).
// Set isEdited=true + editedAt=now → FE render "(đã chỉnh sửa)".
//
// Nếu message này là lastMessage của conversation → cập nhật preview text.
// Emit "message:edited" cho all active participants.
export const editMessageService = async ({ messageId, userId, content }) => {
  const me = BigInt(userId);
  const { message, conv, myParticipant } = await loadMessageForAction(
    messageId,
    me,
  );

  // Reject nếu đã recall — coi như không tồn tại
  if (message.isDeleted) {
    const err = new Error("Message not found.");
    err.status = 404;
    throw err;
  }

  // Chỉ owner mới sửa được
  if (message.senderId.toString() !== me.toString()) {
    const err = new Error("You don't have permission to edit this message.");
    err.status = 403;
    throw err;
  }

  // User đã rời group → không cho action
  if (myParticipant.leftAt) {
    const err = new Error("You are not a member of this conversation.");
    err.status = 403;
    throw err;
  }

  // Chỉ text message edit được
  if (message.type !== "text") {
    const err = new Error("Cannot edit non-text message.");
    err.status = 400;
    throw err;
  }

  // Update message
  message.content = content;
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();

  // Nếu message này là lastMessage cache của conversation → update preview luôn
  if (
    conv.lastMessage?.messageId?.toString() === message._id.toString()
  ) {
    await Conversation.updateOne(
      { _id: conv._id },
      { $set: { "lastMessage.content": truncate(content, 100) } },
    );
  }

  // Bulk-fetch sender + replyTo info để format response giống listMessages
  const userIdsToFetch = [me];
  let replyToMsg = null;
  if (message.replyTo) {
    replyToMsg = await Message.findById(message.replyTo).lean();
    if (replyToMsg) userIdsToFetch.push(replyToMsg.senderId);
  }
  const userMap = await buildUserMap(userIdsToFetch);

  const formatted = formatMessage(
    message.toObject(),
    userMap.get(me.toString()),
    replyToMsg,
    replyToMsg ? userMap.get(replyToMsg.senderId.toString()) : null,
  );

  // Emit "message:edited" cho all active participants (gồm cả sender — multi-tab sync)
  const allActiveIds = conv.participants
    .filter((p) => !p.leftAt)
    .map((p) => p.userId);
  for (const uid of allActiveIds) {
    emitToUser(uid, "message:edited", {
      conversationId: conv._id.toString(),
      message: formatted,
    });
  }

  return formatted;
};

// ============ RECALL MESSAGE (delete for everyone) ============
// Chỉ owner thu hồi được. Set isDeleted=true → FE render "Tin nhắn đã thu hồi".
//
// Cleanup Cloudinary attachment files (best-effort — không rollback action gốc).
// Nếu message là lastMessage → update preview thành "Tin nhắn đã thu hồi".
//
// Note: KHÔNG xóa hard — giữ doc trong DB cho audit/history.
// FE muốn xem replyTo trỏ về message đã recall vẫn được, hiển thị "(đã thu hồi)".
export const recallMessageService = async ({ messageId, userId }) => {
  const me = BigInt(userId);
  const { message, conv, myParticipant } = await loadMessageForAction(
    messageId,
    me,
  );

  if (message.isDeleted) {
    const err = new Error("Message not found.");
    err.status = 404;
    throw err;
  }

  if (message.senderId.toString() !== me.toString()) {
    const err = new Error("You don't have permission to recall this message.");
    err.status = 403;
    throw err;
  }

  if (myParticipant.leftAt) {
    const err = new Error("You are not a member of this conversation.");
    err.status = 403;
    throw err;
  }

  // System message không recall được
  if (message.type === "system") {
    const err = new Error("Cannot recall system message.");
    err.status = 400;
    throw err;
  }

  // Mark deleted (giữ content/attachments trong DB cho audit)
  message.isDeleted = true;
  message.deletedAt = new Date();
  await message.save();

  // Cleanup Cloudinary — destroy mọi attachment file (best-effort)
  for (const att of message.attachments || []) {
    if (att.publicId) {
      try {
        await cloudinary.uploader.destroy(att.publicId);
      } catch (err) {
        console.error(
          "[Cloudinary] destroy failed for",
          att.publicId,
          err.message,
        );
      }
    }
  }

  // Nếu là lastMessage → update preview
  if (
    conv.lastMessage?.messageId?.toString() === message._id.toString()
  ) {
    await Conversation.updateOne(
      { _id: conv._id },
      { $set: { "lastMessage.content": "Tin nhắn đã thu hồi" } },
    );
  }

  // Emit "message:recalled" cho all active participants
  const allActiveIds = conv.participants
    .filter((p) => !p.leftAt)
    .map((p) => p.userId);
  for (const uid of allActiveIds) {
    emitToUser(uid, "message:recalled", {
      conversationId: conv._id.toString(),
      messageId: message._id.toString(),
    });
  }

  return {
    id: message._id.toString(),
    isDeleted: true,
    deletedAt: message.deletedAt,
  };
};

// ============ REMOVE FOR ME (delete chỉ phía 1 user) ============
// User là PARTICIPANT (không cần là sender) → có quyền remove for me bất kỳ message.
// Chỉ ảnh hưởng phía user này — message vẫn tồn tại với người khác.
//
// $addToSet idempotent → gọi nhiều lần OK.
// Emit "message:removed-for-me" CHỈ cho user vừa remove (multi-tab sync).
export const removeMessageForMeService = async ({ messageId, userId }) => {
  const me = BigInt(userId);
  const { message } = await loadMessageForAction(messageId, me);

  await Message.updateOne(
    { _id: message._id },
    { $addToSet: { deletedFor: me } },
  );

  // Emit chỉ về self (multi-tab sync — tab khác của me cũng remove khỏi UI)
  emitToUser(me, "message:removed-for-me", {
    conversationId: message.conversationId.toString(),
    messageId: message._id.toString(),
  });

  return {
    id: message._id.toString(),
    removed: true,
  };
};

// ============ TOGGLE REACTION (FB-like) ============
// 1 user 1 reaction / message. Logic:
//   - Có reaction cũ và reactionId giống → REMOVE (toggle off)
//   - Có reaction cũ và reactionId khác → REPLACE (đổi)
//   - Không có → ADD
//
// reactionId reference ReactionMaster (MySQL) — validate tồn tại trước khi save.
// Denormalize keyName + icon vào Message.reactions[] để FE render không cần lookup.
//
// Emit "message:reaction:updated" cho all active participants với reactions mới.
export const toggleMessageReactionService = async ({
  messageId,
  userId,
  reactionId,
}) => {
  const me = BigInt(userId);
  const { message, conv, myParticipant } = await loadMessageForAction(
    messageId,
    me,
  );

  if (message.isDeleted) {
    const err = new Error("Message not found.");
    err.status = 404;
    throw err;
  }

  if (myParticipant.leftAt) {
    const err = new Error("You are not a member of this conversation.");
    err.status = 403;
    throw err;
  }

  if (message.type === "system") {
    const err = new Error("Cannot react to system message.");
    err.status = 400;
    throw err;
  }

  // Validate reactionId trong ReactionMaster
  const master = await prisma.reactionMaster.findUnique({
    where: { id: Number(reactionId) },
  });
  if (!master) {
    const err = new Error("Invalid reaction.");
    err.status = 400;
    throw err;
  }

  // Find existing reaction của user
  const existing = message.reactions.find(
    (r) => r.userId.toString() === me.toString(),
  );

  let action;
  if (existing && existing.reactionId === master.id) {
    // Toggle off — cùng reaction click 2 lần
    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== me.toString(),
    );
    action = "removed";
  } else if (existing) {
    // Replace — đổi reaction
    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== me.toString(),
    );
    message.reactions.push({
      userId: me,
      reactionId: master.id,
      keyName: master.keyName,
      icon: master.icon,
      createdAt: new Date(),
    });
    action = "replaced";
  } else {
    // Add new
    message.reactions.push({
      userId: me,
      reactionId: master.id,
      keyName: master.keyName,
      icon: master.icon,
      createdAt: new Date(),
    });
    action = "added";
  }
  await message.save();

  const reactionsFormatted = message.reactions.map((r) => ({
    userId: r.userId.toString(),
    reactionId: r.reactionId,
    keyName: r.keyName,
    icon: r.icon,
    createdAt: r.createdAt,
  }));

  // Emit "message:reaction:updated" cho all active participants
  const allActiveIds = conv.participants
    .filter((p) => !p.leftAt)
    .map((p) => p.userId);
  for (const uid of allActiveIds) {
    emitToUser(uid, "message:reaction:updated", {
      conversationId: message.conversationId.toString(),
      messageId: message._id.toString(),
      reactions: reactionsFormatted,
    });
  }

  return {
    messageId: message._id.toString(),
    action, // "added" | "replaced" | "removed"
    reactions: reactionsFormatted,
  };
};
