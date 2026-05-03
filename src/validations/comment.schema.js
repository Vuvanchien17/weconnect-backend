import * as z from "zod";

// Schema cho POST /posts/:postId/comments — tạo comment hoặc reply
// content: bắt buộc, trim trước, không được rỗng, max 2000 ký tự (tham khảo: Twitter 280, FB ~8000)
// parentId: optional. Có giá trị = reply trỏ đến top-level comment.
//   Service sẽ enforce: parent phải tồn tại + cùng postId + parentId=null (auto-flatten nếu user reply trên reply)
export const createCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Comment content is required")
    .max(2000, "Comment must be at most 2000 characters"),
  parentId: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .nullable(),
});

// Schema cho PUT /comments/:id — sửa nội dung comment
// Chỉ cho sửa content, không cho đổi parentId (sẽ phá threading)
export const updateCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Comment content is required")
    .max(2000, "Comment must be at most 2000 characters"),
});
