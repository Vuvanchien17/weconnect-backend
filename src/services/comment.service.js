import prisma from "../config/prisma.js";
import { createNotificationService } from "./notification.service.js";

// ============ HELPERS ============

// Include shape dùng chung khi fetch comment kèm user info
// (Phase SELECT sau khi query — không ảnh hưởng INSERT)
const commentInclude = {
  user: {
    select: {
      id: true,
      userName: true,
      profile: { select: { displayName: true, avatar: true } },
    },
  },
};

// Chuẩn hóa comment shape cơ bản trả về cho FE
const formatComment = (c) => ({
  id: c.id,
  postId: c.postId,
  parentId: c.parentId,
  content: c.content,
  isEdited: c.isEdited,
  user: {
    id: c.user.id,
    userName: c.user.userName,
    displayName: c.user.profile?.displayName || c.user.userName,
    avatar: c.user.profile?.avatar || null,
  },
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

// Top-level comment kèm replyCount + 2 reply preview (cho list view)
const formatTopLevelComment = (c) => ({
  ...formatComment(c),
  replyCount: c._count?.replies ?? 0,
  previewReplies: c.replies?.map(formatComment) ?? [],
});

// ============ CREATE ============
// Logic:
// 1. Check post tồn tại + chưa soft delete
// 2. Nếu có parentId → check parent: tồn tại, cùng postId, chưa deleted
//    Auto-flatten: nếu parent là reply (parent.parentId !== null), trỏ thẳng về top-level grandparent
// 3. Insert comment
export const createCommentService = async (
  postId,
  userId,
  content,
  parentId,
) => {
  // 1. Check post (cần userId để noti post owner cho top-level comment)
  const post = await prisma.post.findUnique({
    where: { id: BigInt(postId) },
    select: { id: true, userId: true, isDeleted: true },
  });
  if (!post || post.isDeleted) {
    const err = new Error("Post not found.");
    err.status = 404;
    throw err;
  }

  // 2. Resolve parentId (auto-flatten reply-on-reply)
  // Lưu parentUserId để noti — là người mà current user thực sự click "Reply" trên
  // (theo FE intent), KHÔNG phải grandparent owner sau khi BE flatten.
  let resolvedParentId = null;
  let parentUserId = null;
  if (parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: BigInt(parentId) },
      select: {
        id: true,
        userId: true,
        postId: true,
        parentId: true,
        isDeleted: true,
      },
    });
    if (!parent || parent.isDeleted) {
      const err = new Error("Parent comment not found.");
      err.status = 404;
      throw err;
    }
    // Bảo đảm parent thuộc đúng post (chống reply chéo qua post khác)
    if (parent.postId !== BigInt(postId)) {
      const err = new Error("Parent comment does not belong to this post.");
      err.status = 400;
      throw err;
    }
    // Auto-flatten: parent là reply → lấy top-level grandparent
    resolvedParentId = parent.parentId !== null ? parent.parentId : parent.id;
    parentUserId = parent.userId;
  }

  // 3. Insert comment + include user info để FE render ngay
  const comment = await prisma.comment.create({
    data: {
      postId: BigInt(postId),
      userId: BigInt(userId),
      parentId: resolvedParentId,
      content,
    },
    include: commentInclude,
  });

  // 4. Notification target:
  // - top-level comment → noti cho post owner
  // - reply → noti cho immediate parent owner (người user click "Reply" trên)
  // Self-action filter có sẵn trong createNotificationService.
  const recipientUserId = parentUserId !== null ? parentUserId : post.userId;
  // Truncate content cho noti gọn (FE click vào xem full)
  const truncatedContent =
    content.length > 100 ? content.substring(0, 100) + "..." : content;

  try {
    await createNotificationService({
      userId: recipientUserId,
      actorId: BigInt(userId),
      type: "comment",
      payload: {
        postId: postId.toString(),
        postOwnerId: post.userId.toString(),
        commentId: comment.id.toString(),
        parentId: resolvedParentId ? resolvedParentId.toString() : null,
        content: truncatedContent,
      },
    });
  } catch (err) {
    console.error("[Notification] comment failed:", err.message);
  }

  return formatComment(comment);
};

// ============ READ LIST (top-level comments của 1 post) ============
// CURSOR pagination cho infinite scroll.
// - cursor: id của top-level comment cuối cùng đã load (string). Lần đầu bỏ trống.
// - limit: 10 mặc định, max 50.
// - sort: "newest" (DESC theo id) | "oldest" (ASC theo id). Default "newest".
// - Trick "+1": fetch take+1 row → biết hasNext mà không cần count query.
// - Mỗi top-level kèm: replyCount + 2 reply preview (để FE render "View N more replies")
export const getCommentsService = async ({ postId, cursor, limit, sort }) => {
  const take = Math.min(Math.max(Number(limit) || 10, 1), 50);

  // Dùng id thay vì createdAt cho cursor để đảm bảo deterministic (id luôn unique)
  const orderBy = sort === "oldest" ? { id: "asc" } : { id: "desc" };

  const where = {
    postId: BigInt(postId),
    parentId: null,
    isDeleted: false,
  };

  const comments = await prisma.comment.findMany({
    where,
    take: take + 1,
    ...(cursor && {
      cursor: { id: BigInt(cursor) },
      skip: 1,
    }),
    orderBy,
    include: {
      ...commentInclude,
      // Đếm số reply chưa bị xóa của mỗi top-level
      _count: {
        select: { replies: { where: { isDeleted: false } } },
      },
      // Lấy 2 reply mới nhất để preview trong feed
      replies: {
        where: { isDeleted: false },
        take: 2,
        orderBy: { id: "asc" }, // replies trong thread show oldest first
        include: commentInclude,
      },
    },
  });

  const hasNext = comments.length > take;
  const items = hasNext ? comments.slice(0, take) : comments;
  const nextCursor = hasNext ? items[items.length - 1].id.toString() : null;

  return {
    data: items.map(formatTopLevelComment),
    metadata: {
      limit: take,
      nextCursor,
      hasNext,
    },
  };
};

// ============ READ REPLIES (replies của 1 top-level comment) ============
// CURSOR pagination — khi user click "View more replies".
// - Sort: oldest first (id ASC) — giống FB, replies trong thread theo thứ tự thời gian
// - cursor: id reply cuối cùng đã load. Lần đầu bỏ trống.
export const getRepliesService = async ({ commentId, cursor, limit }) => {
  const take = Math.min(Math.max(Number(limit) || 10, 1), 50);

  // Verify parent tồn tại + chưa deleted
  const parent = await prisma.comment.findUnique({
    where: { id: BigInt(commentId) },
    select: { id: true, isDeleted: true },
  });
  if (!parent || parent.isDeleted) {
    const err = new Error("Comment not found.");
    err.status = 404;
    throw err;
  }

  const where = {
    parentId: BigInt(commentId),
    isDeleted: false,
  };

  const replies = await prisma.comment.findMany({
    where,
    take: take + 1,
    ...(cursor && {
      cursor: { id: BigInt(cursor) },
      skip: 1,
    }),
    orderBy: { id: "asc" },
    include: commentInclude,
  });

  const hasNext = replies.length > take;
  const items = hasNext ? replies.slice(0, take) : replies;
  const nextCursor = hasNext ? items[items.length - 1].id.toString() : null;

  return {
    data: items.map(formatComment),
    metadata: {
      limit: take,
      nextCursor,
      hasNext,
    },
  };
};

// ============ UPDATE ============
// Chỉ owner mới được sửa. Đánh dấu isEdited=true để FE hiển thị "(đã chỉnh sửa)".
export const updateCommentService = async (commentId, userId, content) => {
  const existing = await prisma.comment.findUnique({
    where: { id: BigInt(commentId) },
    select: { id: true, userId: true, isDeleted: true },
  });

  if (!existing || existing.isDeleted) {
    const err = new Error("Comment not found.");
    err.status = 404;
    throw err;
  }
  if (existing.userId !== BigInt(userId)) {
    const err = new Error("You don't have permission to edit this comment.");
    err.status = 403;
    throw err;
  }

  const updated = await prisma.comment.update({
    where: { id: BigInt(commentId) },
    data: { content, isEdited: true },
    include: commentInclude,
  });

  return formatComment(updated);
};

// ============ DELETE (soft + cascade replies) ============
// Cho phép xóa nếu: là owner của comment HOẶC owner của post
// (giống FB — chủ post có quyền dọn comment trong nhà mình)
//
// CASCADE: nếu xóa top-level (parentId = null) → mark TẤT CẢ replies isDeleted=true.
// Đảm bảo data integrity: không có reply "orphan" (cha đã xóa nhưng reply còn alive),
// → stats.comments.total trong feed luôn match với số comment thực sự hiển thị.
export const deleteCommentService = async (commentId, userId) => {
  const comment = await prisma.comment.findUnique({
    where: { id: BigInt(commentId) },
    select: {
      id: true,
      userId: true,
      parentId: true,
      isDeleted: true,
      post: { select: { userId: true } },
    },
  });

  if (!comment || comment.isDeleted) {
    const err = new Error("Comment not found.");
    err.status = 404;
    throw err;
  }

  const isCommentOwner = comment.userId === BigInt(userId);
  const isPostOwner = comment.post.userId === BigInt(userId);

  if (!isCommentOwner && !isPostOwner) {
    const err = new Error("You don't have permission to delete this comment.");
    err.status = 403;
    throw err;
  }

  // Transaction: mark comment + cascade replies trong 1 atomic op
  await prisma.$transaction(async (tx) => {
    await tx.comment.update({
      where: { id: BigInt(commentId) },
      data: { isDeleted: true },
    });

    // Nếu xóa top-level → cascade tất cả replies chưa bị xóa
    if (comment.parentId === null) {
      await tx.comment.updateMany({
        where: {
          parentId: BigInt(commentId),
          isDeleted: false,
        },
        data: { isDeleted: true },
      });
    }
  });
};

// ============ HELPER: Bulk comment stats cho feed ============
// Dùng cùng pattern với buildReactionStatsMap — chống N+1 khi list feed.
// Đếm cả top-level + replies (tổng số comment hiển thị trên post).
export const buildCommentStatsMap = async (postIds) => {
  if (postIds.length === 0) return new Map();

  const counts = await prisma.comment.groupBy({
    by: ["postId"],
    where: {
      postId: { in: postIds },
      isDeleted: false,
    },
    _count: { _all: true },
  });
  // Init Map với tất cả postIds (kể cả post không có comment nào → total=0)
  const result = new Map();
  for (const id of postIds) {
    result.set(id.toString(), { total: 0 });
  }
  for (const c of counts) {
    result.set(c.postId.toString(), { total: c._count._all });
  }
  return result;
};
