import mongoose from "mongoose";

// ============ SUB-SCHEMAS ============

// Participant trong conversation — direct (2 người) hoặc group (>=2).
// `lastReadMessageId` là ground truth cho read receipts + UX "scroll to last read".
// `unreadCounts` (ở conversation level) là cache để badge query nhanh, có thể derive
// từ `lastReadMessageId` nếu cần cross-check.
const participantSchema = new mongoose.Schema(
  {
    userId: { type: BigInt, required: true }, // SQL -> user.id
    role: { type: String, enum: ["admin", "member"], default: "member" }, // group only
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null }, // group: track ai đã rời (null = đang trong group)
    lastReadMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    mutedUntil: { type: Date, default: null }, // null = not muted; future date = muted tới khi đó
  },
  { _id: false },
);

// Group metadata — chỉ tồn tại khi conversation.type === "group"
const groupSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: null },
    avatar: { type: String, default: null }, // Cloudinary URL
    avatarPublicId: { type: String, default: null }, // để destroy khi đổi/xóa
    createdBy: { type: BigInt, required: true }, // SQL -> user.id
  },
  { _id: false },
);

// Cache message cuối — denormalize để list conversations không cần JOIN ngược về Message.
// Update mỗi khi: gửi message mới / recall / edit message cuối / xóa message cuối.
const lastMessagePreviewSchema = new mongoose.Schema(
  {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    type: {
      type: String,
      enum: ["text", "image", "file", "system"],
      required: true,
    },
    content: { type: String, default: null }, // text snippet hoặc null (vd image-only)
    senderId: { type: BigInt, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

// ============ MAIN SCHEMA ============

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["direct", "group"],
      required: true,
    },
    // directKey: deterministic key cho direct chat (sorted "minId:maxId").
    // Mục đích: dùng làm unique key trong upsert atomic — tránh race condition tạo
    // duplicate conversation khi 2 user click "Message" cùng lúc.
    // CHỈ tồn tại trên type="direct"; group không có field này.
    directKey: { type: String, default: null },
    participants: {
      type: [participantSchema],
      required: true,
    },
    group: {
      type: groupSchema,
      default: null, // null nếu type === "direct"
    },
    lastMessage: {
      type: lastMessagePreviewSchema,
      default: null, // null khi conversation vừa tạo, chưa có message
    },
    lastMessageAt: {
      type: Date,
      default: null, // dùng để sort conversation list "newest first"
    },
    // Cache unread count per user — atomic $inc khi gửi message, reset khi mark read.
    // Map<userIdString, count>. Dùng cho list conversations badge (không cần count mỗi lần).
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    // User đã "Hide conversation" phía mình (FB feature).
    // Khi nhận message mới → BE auto remove userId khỏi deletedFor để un-hide.
    deletedFor: [{ type: BigInt }],
  },
  { timestamps: true },
);

// ============ INDEXES ============

// Index 1: list conversations của 1 user, sort theo lastMessageAt DESC
conversationSchema.index({ "participants.userId": 1, lastMessageAt: -1 });

// Index 2: unique cho direct chat — partialFilterExpression chỉ apply khi
// directKey là string (group conversations có directKey=null sẽ bỏ qua index).
// Tác dụng: race-safe khi 2 user cùng click Message — request thứ 2 sẽ fail
// duplicate key, controller retry findOne lấy conversation đã tạo.
conversationSchema.index(
  { directKey: 1 },
  {
    unique: true,
    partialFilterExpression: { directKey: { $type: "string" } },
  },
);

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
