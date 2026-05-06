import * as z from "zod";

// Empty string → null helper (giống pattern profile.schema)
const emptyToNull = (val) =>
  typeof val === "string" && val.trim() === "" ? null : val;

// POST /conversations/direct — body: { otherUserId }
// Accept cả string và number (FE thường gửi BigInt → string), refine numeric
export const createDirectConversationSchema = z.object({
  otherUserId: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((v) => /^\d+$/.test(v), "Invalid otherUserId"),
});

// POST /conversations/:id/messages — multipart body sau multer parse
// Note: req.files validate ở controller (Zod không có access vào files)
// Validation rule: phải có ÍT NHẤT 1 trong (content, attachments) — controller check.
export const sendMessageSchema = z.object({
  content: z
    .preprocess(
      emptyToNull,
      z.string().max(5000, "Message too long (max 5000 chars).").nullable(),
    )
    .optional(),
  replyTo: z
    .preprocess(
      emptyToNull,
      z
        .string()
        .regex(/^[a-fA-F0-9]{24}$/, "Invalid replyTo (must be ObjectId)")
        .nullable(),
    )
    .optional(),
});

// PUT /messages/:id — body { content }
// Edit chỉ áp dụng cho text message. content KHÔNG được rỗng (muốn xóa thì recall).
export const editMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Content required.")
    .max(5000, "Message too long (max 5000 chars)."),
});

// POST /messages/:id/reactions — body { reactionId }
// reactionId reference đến ReactionMaster.id (1-7) trong MySQL.
// Service layer validate id tồn tại + lấy keyName/icon để denormalize vào Message.
export const reactMessageSchema = z.object({
  reactionId: z.coerce
    .number()
    .int()
    .positive("Invalid reactionId."),
});
