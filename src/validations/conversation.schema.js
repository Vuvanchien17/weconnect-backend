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

// ============ STEP 2c — GROUP CHAT ============

// memberIds preprocessor: accept JSON array string ("[5,7]") OR repeated form fields.
// FE thường gửi qua FormData append nhiều lần cùng key → multer ra array of strings.
// Hoặc FE stringify JSON array → BE parse.
const parseMemberIds = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    if (val.trim() === "") return [];
    // Try JSON parse first
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* fall through to CSV split */
    }
    // CSV fallback
    return val.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return val;
};

const memberIdsField = z
  .preprocess(
    parseMemberIds,
    z
      .array(z.union([z.string(), z.number()]).transform((v) => String(v)))
      .refine(
        (arr) => arr.every((id) => /^\d+$/.test(id)),
        "memberIds must be numeric strings",
      ),
  );

// POST /conversations/group — multipart: { name, description?, memberIds[], avatar? file }
// Creator tự động được add với role=admin, FE chỉ gửi memberIds của các user khác.
export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Group name required.")
    .max(100, "Group name too long (max 100 chars)."),
  description: z
    .preprocess(emptyToNull, z.string().max(500, "Description too long.").nullable())
    .optional(),
  memberIds: memberIdsField.refine(
    (arr) => arr.length >= 1,
    "At least 1 member required (besides creator).",
  ),
});

// PATCH /conversations/:id/group — multipart: { name?, description?, avatar? file }
// Tất cả field đều optional → cho phép update partial. Controller check ít nhất
// 1 thay đổi trước khi process.
export const updateGroupInfoSchema = z.object({
  name: z
    .preprocess(
      emptyToNull,
      z
        .string()
        .min(1, "Group name required.")
        .max(100, "Group name too long.")
        .nullable(),
    )
    .optional(),
  description: z
    .preprocess(emptyToNull, z.string().max(500).nullable())
    .optional(),
});

// POST /conversations/:id/members — body: { memberIds: [] }
export const addMembersSchema = z.object({
  memberIds: memberIdsField.refine(
    (arr) => arr.length >= 1,
    "At least 1 memberId required.",
  ),
});

// PATCH /conversations/:id/members/:userId/role — body: { role: "admin"|"member" }
export const changeMemberRoleSchema = z.object({
  role: z.enum(["admin", "member"], { message: "Role must be admin or member." }),
});
