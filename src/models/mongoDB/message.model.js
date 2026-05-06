import mongoose from "mongoose";

// ============ SUB-SCHEMAS ============

// Attachment — 1 message có thể đính kèm nhiều file/ảnh/video (giống FB Messenger).
// `publicId` để destroy Cloudinary khi recall/delete message.
const attachmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["image", "video", "file"],
      required: true,
    },
    url: { type: String, required: true }, // Cloudinary secure_url
    publicId: { type: String, default: null }, // Cloudinary public_id
    fileName: { type: String, default: null }, // cho file type (vd "report.pdf")
    mimeType: { type: String, default: null },
    size: { type: Number, default: null }, // bytes
    width: { type: Number, default: null }, // image/video metadata
    height: { type: Number, default: null },
  },
  { _id: false },
);

// Reaction trên message — reference 7 reaction trong ReactionMaster (MySQL).
// 1 user 1 reaction / message — service enforce qua filter array khi đổi.
//
// Denormalize `keyName` + `icon` từ master vào doc → read không cần JOIN ngược.
// Master stable (7 fixed reactions, hiếm khi đổi) nên acceptable trade-off.
const reactionSchema = new mongoose.Schema(
  {
    userId: { type: BigInt, required: true },
    reactionId: { type: Number, required: true }, // ref ReactionMaster.id (MySQL)
    keyName: { type: String, required: true }, // denormalized — vd "love", "haha"
    icon: { type: String, required: true }, // denormalized — vd "❤️"
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Metadata cho system message (vd "X đã thêm Y vào nhóm").
// FE switch theo `action` để render đúng template + icon.
const systemMetaSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: [
        "member_added",
        "member_removed",
        "member_left",
        "group_name_changed",
        "group_avatar_changed",
        "admin_promoted",
        "admin_demoted",
      ],
      required: true,
    },
    targetUserId: { type: BigInt, default: null }, // user bị action (vd người bị add/remove)
    payload: { type: mongoose.Schema.Types.Mixed, default: null }, // {oldName, newName,...}
  },
  { _id: false },
);

// ============ MAIN SCHEMA ============

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: { type: BigInt, required: true, index: true }, // SQL -> user.id

    // Type message:
    // - text: content có giá trị, attachments rỗng
    // - image/file: content có thể null (caption optional), attachments có data
    // - system: tự động tạo cho event group, content là string template, có systemMeta
    type: {
      type: String,
      enum: ["text", "image", "file", "system"],
      required: true,
      default: "text",
    },

    content: { type: String, trim: true, default: null }, // text body / system template
    attachments: { type: [attachmentSchema], default: [] }, // multi-attachment / 1 message

    // Reply 1 message khác (FB Messenger feature). Null = không reply.
    // FE fetch parent message qua replyTo, render preview "Đang trả lời X".
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    // FB-like emoji on message. Mỗi user chỉ có 1 reaction trên 1 message
    // (service layer filter array khi đổi emoji).
    reactions: { type: [reactionSchema], default: [] },

    // Chỉ có giá trị khi type === "system"
    systemMeta: { type: systemMetaSchema, default: null },

    // Edit message — chỉ owner sửa được, set isEdited=true để FE render "(đã chỉnh sửa)".
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },

    // Recall — owner thu hồi message, mọi người thấy "Tin nhắn đã thu hồi"
    // (giống FB "Unsend for everyone"). Khác với deletedFor (chỉ ẩn 1 phía).
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },

    // "Remove for me" — chỉ user trong array không thấy, người khác vẫn thấy bình thường.
    deletedFor: [{ type: BigInt }],
  },
  { timestamps: true },
);

// ============ INDEXES ============

// Cursor pagination — list messages của 1 conversation, sort theo _id DESC.
// ObjectId có timestamp embed → sort theo _id ≈ createdAt.
messageSchema.index({ conversationId: 1, _id: -1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
