import * as z from "zod";

// POST /friend-requests — gửi lời mời kết bạn
// Service sẽ enforce: receiverId !== senderId (chính mình),
// chưa là bạn, chưa có pending, không bị block (cả 2 chiều), auto-match nếu cần
export const sendFriendRequestSchema = z.object({
  receiverId: z.coerce
    .number()
    .int()
    .positive("receiverId must be a positive integer"),
});

// POST /blocks — block 1 user
// Service sẽ enforce: blockedId !== blockerId, chưa block trước đó,
// transaction xóa Friendship + pending FriendRequest 2 chiều
export const blockUserSchema = z.object({
  blockedId: z.coerce
    .number()
    .int()
    .positive("blockedId must be a positive integer"),
});
