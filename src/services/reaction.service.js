import prisma from "../config/prisma.js";

// ============ REACT / UPDATE REACTION ============
// 1 user chỉ có 1 reaction trên 1 post (PK composite postId+userId).
// Click emoji khác → update. Bỏ thì gọi removeReactionService (FE tự handle toggle).
export const reactToPostService = async (postId, userId, reactionId) => {
  // 1. Check post tồn tại + chưa bị soft delete
  const post = await prisma.post.findUnique({
    where: { id: BigInt(postId) },
    select: { id: true, isDeleted: true },
  });
  if (!post || post.isDeleted) {
    const err = new Error("Post not found.");
    err.status = 404;
    throw err;
  }

  // 2. Check reactionId hợp lệ
  const reaction = await prisma.reactionMaster.findUnique({
    where: { id: Number(reactionId) },
  });
  if (!reaction) {
    const err = new Error("Invalid reaction.");
    err.status = 400;
    throw err;
  }

  // 3. Upsert
  const result = await prisma.postReaction.upsert({
    where: {
      postId_userId: {
        postId: BigInt(postId),
        userId: BigInt(userId),
      },
    },
    update: { reactionId: Number(reactionId) },
    create: {
      postId: BigInt(postId),
      userId: BigInt(userId),
      reactionId: Number(reactionId),
    },
    include: { reaction: true },
  });

  return result;
};

// ============ REMOVE REACTION ============
export const removeReactionService = async (postId, userId) => {
  try {
    await prisma.postReaction.delete({
      where: {
        postId_userId: {
          postId: BigInt(postId),
          userId: BigInt(userId),
        },
      },
    });
  } catch (error) {
    if (error.code === "P2025") {
      const err = new Error("Reaction not found.");
      err.status = 404;
      throw err;
    }
    throw error;
  }
};

// ============ LIST USERS WHO REACTED ============
// Có summary count theo loại + danh sách user (paginated).
// Optional filter ?type=love → chỉ lấy user react bằng love.
export const getPostReactionsService = async ({
  postId,
  type,
  page,
  limit,
}) => {
  const currentPage = Math.max(Number(page) || 1, 1);
  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const skip = (currentPage - 1) * take;

  const where = {
    postId: BigInt(postId),
    ...(type && { reaction: { keyName: type } }),
  };

  const [total, reactions, counts] = await prisma.$transaction([
    prisma.postReaction.count({ where }),
    prisma.postReaction.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            userName: true,
            profile: { select: { displayName: true, avatar: true } },
          },
        },
        reaction: true,
      },
    }),
    // Summary tổng theo từng loại reaction trên toàn post (không filter type)
    prisma.postReaction.groupBy({
      by: ["reactionId"],
      where: { postId: BigInt(postId) },
      _count: { _all: true },
    }),
  ]);

  // Lookup ReactionMaster để có icon/keyName cho summary
  const masters = await prisma.reactionMaster.findMany({
    where: { id: { in: counts.map((c) => c.reactionId) } },
  });
  const masterMap = new Map(masters.map((m) => [m.id, m]));

  const summary = counts
    .map((c) => ({
      reactionId: c.reactionId,
      keyName: masterMap.get(c.reactionId)?.keyName,
      icon: masterMap.get(c.reactionId)?.icon,
      count: c._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  const data = reactions.map((r) => ({
    user: {
      id: r.user.id,
      userName: r.user.userName,
      displayName: r.user.profile?.displayName || r.user.userName,
      avatar: r.user.profile?.avatar || null,
    },
    reaction: {
      id: r.reaction.id,
      keyName: r.reaction.keyName,
      displayText: r.reaction.displayText,
      icon: r.reaction.icon,
    },
    createdAt: r.createdAt,
  }));

  return {
    metadata: {
      total,
      current_page: currentPage,
      limit: take,
      total_pages: Math.ceil(total / take),
    },
    summary,
    data,
  };
};

// ============ HELPER: Attach reaction stats to a list of posts ============
// Dùng chung cho getPostsService và getPostByIdService.
// Trả về Map<postId(string), { total, topTypes, myReaction }>.
export const buildReactionStatsMap = async (postIds, currentUserId) => {
  if (postIds.length === 0) return new Map();

  const [counts, myReactions] = await prisma.$transaction([
    prisma.postReaction.groupBy({
      by: ["postId", "reactionId"],
      where: { postId: { in: postIds } },
      _count: { _all: true },
    }),
    currentUserId
      ? prisma.postReaction.findMany({
          where: {
            postId: { in: postIds },
            userId: BigInt(currentUserId),
          },
          include: { reaction: true },
        })
      : prisma.postReaction.findMany({ where: { id: -1 } }), // empty
  ]);

  // Master lookup
  const reactionIds = [...new Set(counts.map((c) => c.reactionId))];
  const masters = reactionIds.length
    ? await prisma.reactionMaster.findMany({
        where: { id: { in: reactionIds } },
      })
    : [];
  const masterMap = new Map(masters.map((m) => [m.id, m]));

  // Group counts by postId
  const statsByPost = new Map();
  for (const c of counts) {
    const key = c.postId.toString();
    if (!statsByPost.has(key)) {
      statsByPost.set(key, { total: 0, byType: [] });
    }
    const stat = statsByPost.get(key);
    stat.total += c._count._all;
    const master = masterMap.get(c.reactionId);
    stat.byType.push({
      reactionId: c.reactionId,
      keyName: master?.keyName,
      icon: master?.icon,
      count: c._count._all,
    });
  }

  // Sort byType desc, lấy top 3
  for (const stat of statsByPost.values()) {
    stat.byType.sort((a, b) => b.count - a.count);
    stat.topTypes = stat.byType.slice(0, 3);
    delete stat.byType;
  }

  // myReaction map
  const myReactionMap = new Map(
    myReactions.map((r) => [
      r.postId.toString(),
      {
        id: r.reaction.id,
        keyName: r.reaction.keyName,
        icon: r.reaction.icon,
      },
    ]),
  );

  // Merge — đảm bảo mọi postId đều có entry kể cả khi 0 reaction
  const result = new Map();
  for (const id of postIds) {
    const key = id.toString();
    result.set(key, {
      total: statsByPost.get(key)?.total || 0,
      topTypes: statsByPost.get(key)?.topTypes || [],
      myReaction: myReactionMap.get(key) || null,
    });
  }
  return result;
};
