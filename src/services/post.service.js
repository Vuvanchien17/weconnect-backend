import prisma from "../config/prisma.js";
import { cloudinary } from "../config/cloudinary.js";
import { buildReactionStatsMap } from "./reaction.service.js";
import { buildCommentStatsMap } from "./comment.service.js";
import { getBlockListIds, getFriendIds } from "./friend.service.js";

// ============ HELPER: Build visibility filter cho post ============
// Trả về mảng filter để dùng trong AND clause của Prisma where.
// Logic: user chỉ thấy post nếu
//   1. Owner KHÔNG nằm trong block list (cả 2 chiều)
//   2. AND privacy phù hợp:
//      - public            → ai cũng thấy
//      - friends + variants → bạn bè HOẶC chính mình
//      - private           → chỉ chính mình
//
// TODO v2: friends_except / specific_friends / custom hiện đang treat như "friends"
// (cần thêm bảng PostExcludedUser / PostAllowedUser để implement chính xác).
const buildVisibilityFilters = (currentUserId, friendIds, blockListIds) => {
  const me = BigInt(currentUserId);
  const filters = [];

  // 1. Block filter — loại post của user trong block list
  if (blockListIds.length > 0) {
    filters.push({ userId: { notIn: blockListIds } });
  }

  // 2. Privacy filter — 3 nhánh OR
  filters.push({
    OR: [
      // Nhánh 1: post công khai
      { postPrivacy: { name: "public" } },

      // Nhánh 2: post bạn bè (gồm cả các loại friends_*) — chỉ owner hoặc friend
      {
        AND: [
          {
            postPrivacy: {
              name: {
                in: ["friends", "friends_except", "specific_friends", "custom"],
              },
            },
          },
          {
            OR: [
              { userId: me }, // chính mình
              { userId: { in: friendIds } }, // bạn bè
            ],
          },
        ],
      },

      // Nhánh 3: post riêng tư — chỉ owner
      {
        AND: [{ postPrivacy: { name: "private" } }, { userId: me }],
      },
    ],
  });

  return filters;
};

// include structure dùng chung khi trả về post đầy đủ
const fullPostInclude = {
  user: { include: { profile: true } },
  postPrivacy: true,
  postBlocks: { orderBy: { position: "asc" } },
  postTags: { include: { taggedUser: { include: { profile: true } } } },
  postCollaborators: {
    include: { invitee: { include: { profile: true } } },
  },
};

// chuẩn hóa tags/collaborators về shape gọn cho FE
const formatPost = (post) => ({
  ...post,
  postTags: post.postTags.map((tag) => ({
    userId: tag.taggedUser.id,
    userName: tag.taggedUser.userName,
    displayName: tag.taggedUser.profile?.displayName,
    avatar: tag.taggedUser.profile?.avatar,
  })),
  postCollaborators: post.postCollaborators.map((collab) => ({
    userId: collab.invitee.id,
    userName: collab.invitee.userName,
    displayName: collab.invitee.profile?.displayName,
    avatar: collab.invitee.profile?.avatar,
    status: collab.status,
  })),
});

// lấy danh sách Cloudinary public_id từ postBlocks (image/video)
const extractCloudinaryIds = (postBlocks) =>
  postBlocks
    .filter((b) => b.type === "image" || b.type === "video")
    .map((b) => b.content?.imageId || b.content?.videoId)
    .filter(Boolean);

export const createFullPostService = async (
  files,
  userId,
  privacyId,
  blocks,
  taggedUserIds,
  collabUserIds,
) => {
  const newPost = await prisma.$transaction(async (tx) => {
    // create new post
    const post = await tx.post.create({
      data: {
        userId: BigInt(userId),
        privacyId: Number(privacyId),
      },
    });

    // handle blocks
    let imgCounter = 0;
    let videoCounter = 0;
    const processedBlocks = blocks.map((block) => {
      const newBlock = { ...block };
      console.log(newBlock);
      if (newBlock.type === "image" && files.image?.[imgCounter]) {
        newBlock.content = {
          ...newBlock.content,
          image: files.image?.[imgCounter].path,
          imageId: files.image?.[imgCounter].filename,
        };
        imgCounter++;
      } else if (newBlock.type === "video" && files.video?.[videoCounter]) {
        newBlock.content = {
          ...newBlock.content,
          video: files.video?.[videoCounter].path,
          videoId: files.video?.[videoCounter].filename,
        };
        videoCounter++;
      }
      return {
        postId: BigInt(post.id),
        type: newBlock.type,
        position: newBlock.position,
        content: newBlock.content,
      };
    });

    await tx.postBlock.createMany({
      data: processedBlocks,
    });

    // handle collabUserIds
    const filterCollabUserIds = collabUserIds.filter((id) => id != userId);

    // check exists of collabUser
    const validCollabUsers = await prisma.user.findMany({
      where: {
        id: { in: filterCollabUserIds.map((id) => BigInt(id)) },
        isDeleted: false,
      },
      select: { id: true },
    });

    const finalCollabUserIds = validCollabUsers.map((user) => user.id);
    const processedCollabUserIds = finalCollabUserIds.map((id) => ({
      postId: BigInt(post.id),
      inviterId: BigInt(userId),
      inviteeId: BigInt(id),
    }));

    // insert database table post_Collaborator
    await tx.postCollaborator.createMany({
      data: processedCollabUserIds,
    });

    // handle taggedUserIds
    // Remove yourself from the tag list
    const filteredTaggedIds = taggedUserIds.filter((id) => id != userId);

    // check exists of taggedUser
    const validUsers = await tx.user.findMany({
      where: {
        id: { in: filteredTaggedIds.map((id) => BigInt(id)) },
        isDeleted: false,
      },
      select: { id: true },
    });

    const finalIdstoTag = validUsers.map((user) => user.id);

    const processedTaggedUserIds = finalIdstoTag.map((id) => {
      return {
        postId: BigInt(post.id),
        taggedBy: BigInt(userId),
        taggedUserId: BigInt(id),
      };
    });

    // insert to database table post_tag
    await tx.postTag.createMany({
      data: processedTaggedUserIds,
    });

    const result = await tx.post.findUnique({
      where: { id: post.id },
      include: {
        postBlocks: {
          orderBy: { position: "asc" },
        },
        postTags: {
          include: {
            taggedUser: {
              include: {
                profile: true,
              },
            },
          },
        },
        postCollaborators: {
          include: {
            invitee: {
              include: {
                profile: true,
              },
            },
          },
        },
      },
    });

    // return response forward to controller
    return {
      ...result,
      postTags: result.postTags.map((tag) => ({
        userId: tag.taggedUser.id,
        userName: tag.taggedUser.userName,
        displayName: tag.taggedUser.profile?.displayName,
        avatar: tag.taggedUser.profile?.avatar,
      })),
      postCollaborators: result.postCollaborators.map((collab) => ({
        userId: collab.invitee.id,
        userName: collab.invitee.userName,
        displayName: collab.invitee.profile?.displayName,
        avatar: collab.invitee.profile?.avatar,
        status: collab.status,
      })),
    };
  });

  return newPost;
};

// ============ READ ONE ============
// Áp dụng visibility filter (privacy + block) — nếu không match → trả null
// (controller sẽ trả 404, KHÔNG tiết lộ post tồn tại nhưng không có quyền xem)
export const getPostByIdService = async (postId, currentUserId) => {
  // Get friend + block list của current user
  const [friendIds, blockListIds] = await Promise.all([
    getFriendIds(currentUserId),
    getBlockListIds(currentUserId),
  ]);

  const visibilityFilters = buildVisibilityFilters(
    currentUserId,
    friendIds,
    blockListIds,
  );

  const post = await prisma.post.findFirst({
    where: {
      AND: [{ id: BigInt(postId), isDeleted: false }, ...visibilityFilters],
    },
    include: fullPostInclude,
  });

  if (!post) return null;

  // Bulk-fetch song song reaction + comment stats cho 1 post
  const [reactionStatsMap, commentStatsMap] = await Promise.all([
    buildReactionStatsMap([post.id], currentUserId),
    buildCommentStatsMap([post.id]),
  ]);

  const formatted = formatPost(post);
  const key = post.id.toString();
  return {
    ...formatted,
    stats: {
      reactions: reactionStatsMap.get(key),
      comments: commentStatsMap.get(key),
    },
  };
};

// ============ READ LIST ============
// CURSOR pagination cho infinite scroll. userId optional để lọc post của 1 user.
// - cursor: id của post cuối cùng đã load (string vì BigInt). Lần đầu không cần.
// - limit: 10 mặc định, max 50.
// - Trick "+1": fetch take+1 row → biết còn page tiếp không mà không cần count query riêng.
// stats.reactions: { total, topTypes (top 3 emoji), myReaction }
// stats.comments: { total }
// TODO: thêm shares vào stats sau khi làm xong feature share
export const getPostsService = async ({ userId, cursor, limit, currentUserId }) => {
  const take = Math.min(Math.max(Number(limit) || 10, 1), 50);

  // Get friend + block list của current user (parallel)
  const [friendIds, blockListIds] = await Promise.all([
    getFriendIds(currentUserId),
    getBlockListIds(currentUserId),
  ]);

  const visibilityFilters = buildVisibilityFilters(
    currentUserId,
    friendIds,
    blockListIds,
  );

  // AND combine: base + profile filter (nếu có) + visibility
  const where = {
    AND: [
      { isDeleted: false },
      ...(userId ? [{ userId: BigInt(userId) }] : []),
      ...visibilityFilters,
    ],
  };

  const posts = await prisma.post.findMany({
    where,
    take: take + 1, // lấy dư 1 row để biết hasNext
    ...(cursor && {
      cursor: { id: BigInt(cursor) },
      skip: 1, // skip cursor row (đã trả ở lần trước)
    }),
    orderBy: { id: "desc" },
    include: fullPostInclude,
  });

  const hasNext = posts.length > take;
  const items = hasNext ? posts.slice(0, take) : posts;
  const nextCursor = hasNext ? items[items.length - 1].id.toString() : null;

  // Bulk-fetch song song reaction + comment stats cho tất cả post của page
  const postIds = items.map((p) => p.id);
  const [reactionStatsMap, commentStatsMap] = await Promise.all([
    buildReactionStatsMap(postIds, currentUserId),
    buildCommentStatsMap(postIds),
  ]);

  const data = items.map((p) => {
    const formatted = formatPost(p);
    const key = p.id.toString();
    return {
      id: formatted.id,
      author: {
        id: formatted.user.id,
        displayName:
          formatted.user.profile?.displayName || formatted.user.userName,
        avatar: formatted.user.profile?.avatar || null,
      },
      postBlocks: formatted.postBlocks,
      postPrivacy: formatted.postPrivacy,
      postTags: formatted.postTags,
      postCollaborators: formatted.postCollaborators,
      stats: {
        reactions: reactionStatsMap.get(key),
        comments: commentStatsMap.get(key),
      },
      created_at: formatted.createdAt,
      updated_at: formatted.updatedAt,
    };
  });

  return {
    data,
    metadata: {
      limit: take,
      nextCursor, // string id của post cuối cùng, hoặc null nếu hết
      hasNext, // false → FE không gọi tiếp
    },
  };
};

// ============ UPDATE ============
// Chiến lược: full-replace. Xóa hết postBlocks/tags/collaborators cũ rồi insert lại.
// Cloudinary file cũ không có trong payload mới sẽ bị destroy.
export const updateFullPostService = async (
  files,
  postId,
  userId,
  privacyId,
  blocks,
  taggedUserIds,
  collabUserIds,
) => {
  // 1. Check tồn tại + ownership
  const existing = await prisma.post.findUnique({
    where: { id: BigInt(postId) },
    include: { postBlocks: true },
  });

  if (!existing || existing.isDeleted) {
    const err = new Error("Post not found.");
    err.status = 404;
    throw err;
  }
  if (existing.userId !== BigInt(userId)) {
    const err = new Error("You don't have permission to update this post.");
    err.status = 403;
    throw err;
  }

  const oldCloudinaryIds = extractCloudinaryIds(existing.postBlocks);

  // 2. Transaction: xóa cũ + insert mới + update meta
  const updated = await prisma.$transaction(async (tx) => {
    await tx.postBlock.deleteMany({ where: { postId: BigInt(postId) } });
    await tx.postTag.deleteMany({ where: { postId: BigInt(postId) } });
    await tx.postCollaborator.deleteMany({
      where: { postId: BigInt(postId) },
    });

    await tx.post.update({
      where: { id: BigInt(postId) },
      data: {
        privacyId: Number(privacyId),
        isEdited: true,
      },
    });

    // handle blocks (cùng logic với create)
    let imgCounter = 0;
    let videoCounter = 0;
    const processedBlocks = blocks.map((block) => {
      const newBlock = { ...block };
      if (newBlock.type === "image" && files?.image?.[imgCounter]) {
        newBlock.content = {
          ...newBlock.content,
          image: files.image[imgCounter].path,
          imageId: files.image[imgCounter].filename,
        };
        imgCounter++;
      } else if (newBlock.type === "video" && files?.video?.[videoCounter]) {
        newBlock.content = {
          ...newBlock.content,
          video: files.video[videoCounter].path,
          videoId: files.video[videoCounter].filename,
        };
        videoCounter++;
      }
      return {
        postId: BigInt(postId),
        type: newBlock.type,
        position: newBlock.position,
        content: newBlock.content,
      };
    });

    await tx.postBlock.createMany({ data: processedBlocks });

    // collaborators
    const filteredCollab = collabUserIds.filter((id) => id != userId);
    if (filteredCollab.length > 0) {
      const validCollab = await tx.user.findMany({
        where: {
          id: { in: filteredCollab.map((id) => BigInt(id)) },
          isDeleted: false,
        },
        select: { id: true },
      });
      if (validCollab.length > 0) {
        await tx.postCollaborator.createMany({
          data: validCollab.map((u) => ({
            postId: BigInt(postId),
            inviterId: BigInt(userId),
            inviteeId: u.id,
          })),
        });
      }
    }

    // tags
    const filteredTags = taggedUserIds.filter((id) => id != userId);
    if (filteredTags.length > 0) {
      const validTags = await tx.user.findMany({
        where: {
          id: { in: filteredTags.map((id) => BigInt(id)) },
          isDeleted: false,
        },
        select: { id: true },
      });
      if (validTags.length > 0) {
        await tx.postTag.createMany({
          data: validTags.map((u) => ({
            postId: BigInt(postId),
            taggedBy: BigInt(userId),
            taggedUserId: u.id,
          })),
        });
      }
    }

    return tx.post.findUnique({
      where: { id: BigInt(postId) },
      include: fullPostInclude,
    });
  });

  // 3. Cleanup Cloudinary: destroy file cũ không còn trong blocks mới
  const newCloudinaryIds = extractCloudinaryIds(updated.postBlocks);
  const toDelete = oldCloudinaryIds.filter(
    (id) => !newCloudinaryIds.includes(id),
  );
  for (const publicId of toDelete) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.error("Cloudinary cleanup failed for", publicId, err.message);
    }
  }

  return formatPost(updated);
};

// ============ DELETE (soft) ============
export const deletePostService = async (postId, userId) => {
  const post = await prisma.post.findUnique({
    where: { id: BigInt(postId) },
    select: { userId: true, isDeleted: true },
  });

  if (!post || post.isDeleted) {
    const err = new Error("Post not found.");
    err.status = 404;
    throw err;
  }
  if (post.userId !== BigInt(userId)) {
    const err = new Error("You don't have permission to delete this post.");
    err.status = 403;
    throw err;
  }

  await prisma.post.update({
    where: { id: BigInt(postId) },
    data: { isDeleted: true },
  });
};
