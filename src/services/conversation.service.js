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

// ============================================================
// STEP 2c — GROUP CHAT
// create group / get conversation detail / update group info /
// add member / remove member / leave / change role
// ============================================================

// ============ HELPER: createSystemMessage ============
// Tự tạo message type="system" cho event group (member_added, group_name_changed,...).
// Cập nhật Conversation.lastMessage preview để FE hiển thị trên sidebar.
//
// previewText: BE-generated string (đã include tên actor/target) cho preview gọn.
// FE render trong chat thread sẽ dùng systemMeta để build template riêng.
const createSystemMessage = async ({
  conversationId,
  actorId,
  action,
  targetUserId = null,
  payload = null,
  previewText,
}) => {
  const message = await Message.create({
    conversationId,
    senderId: actorId,
    type: "system",
    content: previewText, // FE có thể dùng nếu không muốn build từ systemMeta
    systemMeta: { action, targetUserId, payload },
  });

  await Conversation.updateOne(
    { _id: conversationId },
    {
      $set: {
        lastMessage: {
          messageId: message._id,
          type: "system",
          content: previewText,
          senderId: actorId,
          createdAt: message.createdAt,
        },
        lastMessageAt: message.createdAt,
      },
    },
  );

  return message;
};

// ============ HELPER: emit conversation update ============
// Re-fetch fresh conv (sau mọi update) → emit "conversation:updated" tới tất cả
// participants (gồm cả vừa-rời để họ cập nhật UI lần cuối). Trả về formatted
// conversation luôn để caller dùng làm response (tránh stale doc bug).
//
// extraIds: thêm user ngoài conv hiện tại (vd vừa add vào nhóm — mặc dù họ
// cũng đã có trong fresh.participants sau update, nhưng để API tương thích).
const emitConversationUpdated = async (
  conv,
  currentUserIdStr,
  extraIds = [],
) => {
  const fresh = await Conversation.findById(conv._id).lean();
  if (!fresh) return null;

  const allUserIds = new Set(
    fresh.participants.map((p) => p.userId.toString()),
  );
  for (const id of extraIds) allUserIds.add(id.toString());

  const userMap = await buildUserMap(
    [...allUserIds].map((id) => BigInt(id)),
  );
  const formatted = formatConversationDetail(fresh, currentUserIdStr, userMap);

  for (const uidStr of allUserIds) {
    emitToUser(BigInt(uidStr), "conversation:updated", {
      conversation: formatted,
    });
  }
  return formatted;
};

// ============ HELPER: format conversation detail (full members) ============
// Khác với formatConversation cơ bản (chỉ peer cho direct), shape này có
// FULL participants list — dùng cho GET /:id (group settings page).
const formatConversationDetail = (conv, currentUserIdStr, userMap) => {
  const myParticipant = conv.participants.find(
    (p) => p.userId.toString() === currentUserIdStr,
  );
  const isMuted =
    myParticipant?.mutedUntil &&
    new Date(myParticipant.mutedUntil) > new Date();

  // Cho direct: peer = participant kia. Cho group: null.
  let peer = null;
  if (conv.type === "direct") {
    const peerParticipant = conv.participants.find(
      (p) => p.userId.toString() !== currentUserIdStr,
    );
    if (peerParticipant) {
      peer = formatUser(userMap.get(peerParticipant.userId.toString()));
    }
  }

  return {
    id: conv._id.toString(),
    type: conv.type,
    peer,
    group: conv.group
      ? {
          name: conv.group.name,
          description: conv.group.description || null,
          avatar: conv.group.avatar || null,
          createdBy: conv.group.createdBy?.toString(),
        }
      : null,
    participants: conv.participants.map((p) => ({
      user: formatUser(userMap.get(p.userId.toString())),
      role: p.role,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt || null,
      lastReadMessageId: p.lastReadMessageId?.toString() || null,
    })),
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
    myRole: myParticipant?.role || null,
    myLeftAt: myParticipant?.leftAt || null,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
};

// ============ HELPER: assert admin role ============
// Throw 403 nếu user không phải admin của group.
const assertAdmin = (conv, userIdStr) => {
  const me = conv.participants.find(
    (p) => p.userId.toString() === userIdStr,
  );
  if (!me || me.leftAt) {
    const err = new Error("You are not a member of this conversation.");
    err.status = 403;
    throw err;
  }
  if (me.role !== "admin") {
    const err = new Error("Admin permission required.");
    err.status = 403;
    throw err;
  }
  return me;
};

// ============ CREATE GROUP CONVERSATION ============
// FE gửi multipart: name, description, memberIds (JSON array), avatar (file).
// Creator tự động được thêm với role=admin. Group min 2 người (creator + 1 member).
//
// Validate: tất cả memberIds phải tồn tại trong MySQL (filter ra user không tồn tại).
// Block check skip cho group create (giữ UX đơn giản — TODO v2).
//
// Emit "conversation:created" tới TẤT CẢ members (gồm creator) để FE prepend vào list.
export const createGroupConversationService = async ({
  creatorId,
  name,
  description,
  memberIds,
  avatarFile, // optional — { path, filename } từ multer-cloudinary
}) => {
  const creator = BigInt(creatorId);

  // Filter dedupe + loại creator nếu lỡ include
  const memberSet = new Set(memberIds.map((id) => id.toString()));
  memberSet.delete(creator.toString());
  const cleanedMemberIds = [...memberSet].map((id) => BigInt(id));

  if (cleanedMemberIds.length < 1) {
    const err = new Error("At least 1 member required (besides creator).");
    err.status = 400;
    throw err;
  }

  // Verify all members tồn tại trong MySQL
  const validUsers = await prisma.user.findMany({
    where: {
      id: { in: cleanedMemberIds },
      isDeleted: false,
    },
    select: { id: true },
  });
  if (validUsers.length !== cleanedMemberIds.length) {
    const err = new Error("Some members not found.");
    err.status = 404;
    throw err;
  }

  // Build participants array: creator (admin) + members (member)
  const participants = [
    { userId: creator, role: "admin" },
    ...cleanedMemberIds.map((id) => ({ userId: id, role: "member" })),
  ];

  const now = new Date();
  const group = {
    name,
    description: description || null,
    avatar: avatarFile?.path || null,
    avatarPublicId: avatarFile?.filename || null,
    createdBy: creator,
  };

  const conversation = await Conversation.create({
    type: "group",
    participants,
    group,
    lastMessageAt: now, // để xuất hiện top trên list ngay
    unreadCounts: {},
  });

  // Bulk fetch user info để format response + emit
  const allUserIds = [creator, ...cleanedMemberIds];
  const userMap = await buildUserMap(allUserIds);

  const formatted = formatConversationDetail(
    conversation.toObject(),
    creator.toString(),
    userMap,
  );

  // Emit "conversation:created" cho tất cả members
  for (const uid of allUserIds) {
    emitToUser(uid, "conversation:created", { conversation: formatted });
  }

  return formatted;
};

// ============ GET CONVERSATION DETAIL (full members) ============
// Dùng cho group settings page hoặc generic chat detail.
// Direct conversation cũng work — trả peer info + participants list (2 entry).
export const getConversationByIdService = async ({
  conversationId,
  userId,
}) => {
  const me = BigInt(userId);

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  const conv = await Conversation.findOne({
    _id: conversationId,
    "participants.userId": me, // user phải là participant (gồm cả đã leftAt)
  }).lean();
  if (!conv) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  // Bulk fetch all participant user info
  const allUserIds = conv.participants.map((p) => p.userId);
  const userMap = await buildUserMap(allUserIds);

  return formatConversationDetail(conv, me.toString(), userMap);
};

// ============ UPDATE GROUP INFO ============
// Admin only. Update name / description / avatar (multipart cho avatar).
// Mỗi thay đổi tạo 1 system message + emit "conversation:updated".
//
// Cleanup avatar cũ Cloudinary nếu thay avatar mới (best-effort).
export const updateGroupInfoService = async ({
  conversationId,
  userId,
  name,
  description,
  avatarFile, // optional — multer-cloudinary file
}) => {
  const me = BigInt(userId);

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }
  if (conv.type !== "group") {
    const err = new Error("Only group conversations support this action.");
    err.status = 400;
    throw err;
  }

  // Verify user là active admin
  assertAdmin(conv, me.toString());

  const changes = []; // [{ action, payload, previewText }]
  const oldAvatarPublicId = conv.group.avatarPublicId;

  // Detect changes
  if (name !== undefined && name !== null && name !== conv.group.name) {
    const oldName = conv.group.name;
    changes.push({
      action: "group_name_changed",
      payload: { oldName, newName: name },
      previewText: `đã đổi tên nhóm thành "${name}"`,
    });
    conv.group.name = name;
  }
  if (description !== undefined && description !== conv.group.description) {
    // No system message cho description change (giống FB không noti)
    conv.group.description = description;
  }
  if (avatarFile) {
    changes.push({
      action: "group_avatar_changed",
      payload: null,
      previewText: "đã đổi ảnh nhóm",
    });
    conv.group.avatar = avatarFile.path;
    conv.group.avatarPublicId = avatarFile.filename;
  }

  // Phải có ít nhất 1 thay đổi
  if (changes.length === 0 && description === undefined) {
    const err = new Error("No changes provided.");
    err.status = 400;
    throw err;
  }

  await conv.save();

  // Cleanup Cloudinary avatar cũ (best-effort)
  if (avatarFile && oldAvatarPublicId) {
    try {
      await cloudinary.uploader.destroy(oldAvatarPublicId);
    } catch (err) {
      console.error("[Cloudinary] destroy old avatar failed:", err.message);
    }
  }

  // Lookup actor displayName cho previewText
  const actor = await prisma.user.findUnique({
    where: { id: me },
    select: {
      userName: true,
      profile: { select: { displayName: true } },
    },
  });
  const actorName = actor?.profile?.displayName || actor?.userName || "Ai đó";

  // Tạo system message + emit cho mỗi change có user-visible preview
  const systemMessages = [];
  for (const change of changes) {
    const message = await createSystemMessage({
      conversationId: conv._id,
      actorId: me,
      action: change.action,
      targetUserId: null,
      payload: change.payload,
      previewText: `${actorName} ${change.previewText}`,
    });
    systemMessages.push(message);
  }

  // Emit "message:new" cho mỗi system message (trước emitConversationUpdated
  // để FE nhận message mới rồi mới refresh lastMessage preview)
  if (systemMessages.length > 0) {
    const userMap = await buildUserMap([me]);
    const allActiveIds = conv.participants
      .filter((p) => !p.leftAt)
      .map((p) => p.userId);

    for (const msg of systemMessages) {
      const formatted = formatMessage(
        msg.toObject(),
        userMap.get(me.toString()),
        null,
        null,
      );
      for (const uid of allActiveIds) {
        emitToUser(uid, "message:new", {
          conversationId: conv._id.toString(),
          message: formatted,
        });
      }
    }
  }

  // Re-fetch fresh + emit "conversation:updated" + return formatted
  return await emitConversationUpdated(conv, me.toString());
};

// ============ ADD MEMBERS (admin only) ============
// Multi-add. Đối với user đã từng leftAt → reactivate (clear leftAt + reset joinedAt).
// Đối với user chưa từng tham gia → push entry mới với role=member.
// Tạo 1 system message / member added.
export const addMembersService = async ({
  conversationId,
  userId,
  memberIds,
}) => {
  const me = BigInt(userId);

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }
  if (conv.type !== "group") {
    const err = new Error("Only group conversations support this action.");
    err.status = 400;
    throw err;
  }

  assertAdmin(conv, me.toString());

  // Filter dedupe + loại self
  const memberSet = new Set(memberIds.map((id) => id.toString()));
  memberSet.delete(me.toString());
  const cleanedIds = [...memberSet].map((id) => BigInt(id));

  if (cleanedIds.length === 0) {
    const err = new Error("No valid memberIds provided.");
    err.status = 400;
    throw err;
  }

  // Verify all tồn tại trong MySQL
  const validUsers = await prisma.user.findMany({
    where: { id: { in: cleanedIds }, isDeleted: false },
    select: {
      id: true,
      userName: true,
      profile: { select: { displayName: true } },
    },
  });
  if (validUsers.length !== cleanedIds.length) {
    const err = new Error("Some members not found.");
    err.status = 404;
    throw err;
  }

  // Detect: chưa từng có vs đã từng leftAt vs active
  const existingMap = new Map(
    conv.participants.map((p) => [p.userId.toString(), p]),
  );
  const actuallyAdded = []; // BigInt[] — dùng cho previewText + system msg

  for (const id of cleanedIds) {
    const existing = existingMap.get(id.toString());
    if (!existing) {
      // Push mới
      conv.participants.push({
        userId: id,
        role: "member",
        joinedAt: new Date(),
      });
      actuallyAdded.push(id);
    } else if (existing.leftAt) {
      // Reactivate
      existing.leftAt = null;
      existing.joinedAt = new Date();
      actuallyAdded.push(id);
    }
    // else: đã active, skip
  }

  if (actuallyAdded.length === 0) {
    const err = new Error("All specified users are already active members.");
    err.status = 400;
    throw err;
  }

  await conv.save();

  // Lookup actor name
  const actor = await prisma.user.findUnique({
    where: { id: me },
    select: { userName: true, profile: { select: { displayName: true } } },
  });
  const actorName = actor?.profile?.displayName || actor?.userName || "Ai đó";
  const userInfoMap = new Map(
    validUsers.map((u) => [
      u.id.toString(),
      u.profile?.displayName || u.userName,
    ]),
  );

  // 1 system message / user added
  for (const targetId of actuallyAdded) {
    const targetName = userInfoMap.get(targetId.toString()) || "ai đó";
    await createSystemMessage({
      conversationId: conv._id,
      actorId: me,
      action: "member_added",
      targetUserId: targetId,
      payload: null,
      previewText: `${actorName} đã thêm ${targetName} vào nhóm`,
    });
  }

  // Re-fetch fresh + emit + return formatted (tránh stale lastMessage)
  return await emitConversationUpdated(conv, me.toString(), actuallyAdded);
};

// ============ REMOVE MEMBER (admin kicks someone) ============
// Set leftAt cho participant đó. Tạo system message "X đã xóa Y".
// Emit "conversation:updated" — user bị kick cũng nhận để FE update UI
// "Bạn đã bị xóa khỏi nhóm".
export const removeMemberService = async ({
  conversationId,
  userId,
  targetUserId,
}) => {
  const me = BigInt(userId);
  const target = BigInt(targetUserId);

  if (me === target) {
    const err = new Error(
      "Cannot remove yourself — use leave group instead.",
    );
    err.status = 400;
    throw err;
  }

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }
  if (conv.type !== "group") {
    const err = new Error("Only group conversations support this action.");
    err.status = 400;
    throw err;
  }

  assertAdmin(conv, me.toString());

  const targetParticipant = conv.participants.find(
    (p) => p.userId.toString() === target.toString(),
  );
  if (!targetParticipant || targetParticipant.leftAt) {
    const err = new Error("Member not found in group.");
    err.status = 404;
    throw err;
  }

  // Set leftAt
  targetParticipant.leftAt = new Date();
  await conv.save();

  // Lookup names cho previewText
  const [actor, targetUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: me },
      select: { userName: true, profile: { select: { displayName: true } } },
    }),
    prisma.user.findUnique({
      where: { id: target },
      select: { userName: true, profile: { select: { displayName: true } } },
    }),
  ]);
  const actorName = actor?.profile?.displayName || actor?.userName || "Ai đó";
  const targetName =
    targetUser?.profile?.displayName || targetUser?.userName || "ai đó";

  await createSystemMessage({
    conversationId: conv._id,
    actorId: me,
    action: "member_removed",
    targetUserId: target,
    payload: null,
    previewText: `${actorName} đã xóa ${targetName} khỏi nhóm`,
  });

  // Re-fetch fresh + emit cho TẤT CẢ (gồm user vừa bị kick) + return formatted
  return await emitConversationUpdated(conv, me.toString());
};

// ============ LEAVE GROUP (self) ============
// Set leftAt của chính user. Tạo system message "X đã rời nhóm".
// Note: nếu user là admin duy nhất → vẫn cho leave (group thành "no admin",
// chấp nhận edge case này cho MVP — group sẽ không update được info nữa
// nhưng vẫn có thể chat). FB cũng allow.
export const leaveGroupService = async ({ conversationId, userId }) => {
  const me = BigInt(userId);

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }
  if (conv.type !== "group") {
    const err = new Error("Only group conversations support this action.");
    err.status = 400;
    throw err;
  }

  const myParticipant = conv.participants.find(
    (p) => p.userId.toString() === me.toString(),
  );
  if (!myParticipant) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }
  if (myParticipant.leftAt) {
    const err = new Error("You have already left this group.");
    err.status = 400;
    throw err;
  }

  myParticipant.leftAt = new Date();
  await conv.save();

  const actor = await prisma.user.findUnique({
    where: { id: me },
    select: { userName: true, profile: { select: { displayName: true } } },
  });
  const actorName = actor?.profile?.displayName || actor?.userName || "Ai đó";

  await createSystemMessage({
    conversationId: conv._id,
    actorId: me,
    action: "member_left",
    targetUserId: null,
    payload: null,
    previewText: `${actorName} đã rời nhóm`,
  });

  // Emit cho all participants (gồm cả user vừa rời để tab khác sync UI)
  await emitConversationUpdated(conv, me.toString());

  return { left: true };
};

// ============ CHANGE MEMBER ROLE (admin promotes/demotes) ============
// admin only. Đổi role của target giữa "admin" và "member".
// Tạo system message + emit conversation:updated.
export const changeMemberRoleService = async ({
  conversationId,
  userId,
  targetUserId,
  role,
}) => {
  const me = BigInt(userId);
  const target = BigInt(targetUserId);

  if (me === target) {
    const err = new Error("Cannot change your own role.");
    err.status = 400;
    throw err;
  }

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }

  const conv = await Conversation.findById(conversationId);
  if (!conv) {
    const err = new Error("Conversation not found.");
    err.status = 404;
    throw err;
  }
  if (conv.type !== "group") {
    const err = new Error("Only group conversations support this action.");
    err.status = 400;
    throw err;
  }

  assertAdmin(conv, me.toString());

  const targetParticipant = conv.participants.find(
    (p) => p.userId.toString() === target.toString(),
  );
  if (!targetParticipant || targetParticipant.leftAt) {
    const err = new Error("Member not found in group.");
    err.status = 404;
    throw err;
  }

  if (targetParticipant.role === role) {
    const err = new Error(`Member already has role "${role}".`);
    err.status = 400;
    throw err;
  }

  const action = role === "admin" ? "admin_promoted" : "admin_demoted";
  targetParticipant.role = role;
  await conv.save();

  // System message
  const [actor, targetUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: me },
      select: { userName: true, profile: { select: { displayName: true } } },
    }),
    prisma.user.findUnique({
      where: { id: target },
      select: { userName: true, profile: { select: { displayName: true } } },
    }),
  ]);
  const actorName = actor?.profile?.displayName || actor?.userName || "Ai đó";
  const targetName =
    targetUser?.profile?.displayName || targetUser?.userName || "ai đó";
  const previewText =
    role === "admin"
      ? `${actorName} đã chỉ định ${targetName} làm quản trị viên`
      : `${actorName} đã hạ ${targetName} khỏi vai trò quản trị viên`;

  await createSystemMessage({
    conversationId: conv._id,
    actorId: me,
    action,
    targetUserId: target,
    payload: null,
    previewText,
  });

  // Re-fetch fresh + emit + return formatted (tránh stale lastMessage)
  return await emitConversationUpdated(conv, me.toString());
};
