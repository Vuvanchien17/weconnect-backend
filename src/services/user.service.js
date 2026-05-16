import prisma from "../config/prisma.js";
import { getBlockListIds, getFriendIds } from "./friend.service.js";

export const updateProfileService = async (userId, userData) => {
  const formattedData = {
    ...userData,
    birthDay: userData?.birthDay ? new Date(userData.birthDay) : undefined,
  };

  return await prisma.profile.upsert({
    where: { userId: BigInt(userId) },
    update: formattedData,
    create: {
      userId: BigInt(userId),
      ...formattedData,
    },
  });
};

export const getProfileByUserId = async (userId) => {
  return await prisma.profile.findUnique({
    where: {
      userId: BigInt(userId),
    },
  });
};

export const getProfileByPhoneNumber = async (phoneNumber) => {
  return await prisma.profile.findUnique({
    where: {
      phoneNumber: String(phoneNumber),
    },
  });
};

export const getUserById = async (userId) => {
  return await prisma.user.findUnique({
    where: {
      id: BigInt(userId),
    },
  });
};

// Lấy full thông tin user (join User + Profile) rồi flatten thành 1 object phẳng
export const getMeService = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: BigInt(userId) },
    select: {
      id: true,
      email: true,
      userName: true,
      isProfileComplete: true,
      status: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      // join với Profile
      profile: {
        select: {
          displayName: true,
          avatar: true,
          coverImage: true,
          phoneNumber: true,
          gender: true,
          birthDay: true,
          bio: true,
          location: true,
          website: true,
        },
      },
    },
  });

  if (!user) return null;

  const { profile, ...userFields } = user;

  return {
    ...userFields,
    displayName: profile?.displayName || null,
    avatar: profile?.avatar || null,
    coverImage: profile?.coverImage || null,
    phoneNumber: profile?.phoneNumber || null,
    gender: profile?.gender || null,
    birthDay: profile?.birthDay || null,
    bio: profile?.bio || null,
    location: profile?.location || null,
    website: profile?.website || null,
  };
};

// ============ GET PROFILE BY USERNAME (xem profile user khác) ============
// Lookup theo `userName` (FB-style URL: facebook.com/<username>).
// Khác với getMeService: KHÔNG trả email/phoneNumber/role/status (private fields).
//
// Block-aware: nếu giữa current user và target có quan hệ block (cả 2 chiều)
// → trả null (controller → 404, information hiding) — KHÔNG để lộ user tồn tại.
//
// Tự xem profile mình (targetUserName === user của me) cũng OK — FE simplify
// chỉ cần 1 endpoint `/users/:username/profile` cho mọi case.
export const getUserProfileByUsernameService = async (
  targetUsername,
  currentUserId,
) => {
  const meBig = BigInt(currentUserId);

  // 1. Find user theo userName (chưa cần lookup block — vì cần id thật trước)
  const user = await prisma.user.findFirst({
    where: { userName: targetUsername, isDeleted: false },
    select: {
      id: true,
      userName: true,
      createdAt: true,
      profile: {
        select: {
          displayName: true,
          avatar: true,
          coverImage: true,
          gender: true,
          birthDay: true,
          bio: true,
          location: true,
          website: true,
        },
      },
    },
  });

  if (!user) return null;

  // 2. Check block 2 chiều dựa trên id thật của target (skip nếu là self)
  // UserBlock dùng composite PK [blockerId, blockedId], không có id autoincrement.
  if (user.id !== meBig) {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: meBig, blockedId: user.id },
          { blockerId: user.id, blockedId: meBig },
        ],
      },
      select: { blockerId: true },
    });
    if (block) return null;
  }

  const { profile, ...userFields } = user;
  return {
    ...userFields,
    displayName: profile?.displayName || user.userName,
    avatar: profile?.avatar || null,
    coverImage: profile?.coverImage || null,
    gender: profile?.gender || null,
    birthDay: profile?.birthDay || null,
    bio: profile?.bio || null,
    location: profile?.location || null,
    website: profile?.website || null,
  };
};

export const searchUsersService = async (keyword, currentUserId) => {
  const me = BigInt(currentUserId);

  // Fetch song song: users match keyword + myFriends (cho mutual count + friendStatus)
  const [users, myFriends] = await Promise.all([
    prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { userName: { contains: keyword } },
              { profile: { displayName: { contains: keyword } } },
            ],
          },
          { id: { not: me } },
          { isDeleted: false },
        ],
      },
      take: 10, // limit 10 user
      include: {
        profile: { select: { displayName: true, avatar: true } },
      },
    }),
    getFriendIds(me),
  ]);

  if (users.length === 0) return [];

  const friendsSet = new Set(myFriends.map((id) => id.toString()));

  // Bulk count mutual friends — skip nếu current user chưa có bạn nào.
  // Mutual của candidate C = friends của C ∩ friends của me.
  // 1 query groupBy thay vì N+1 cho từng candidate.
  let mutualMap = new Map();
  if (myFriends.length > 0) {
    const counts = await prisma.friendship.groupBy({
      by: ["userId"],
      where: {
        userId: { in: users.map((u) => u.id) },
        friendId: { in: myFriends },
      },
      _count: { _all: true },
    });
    mutualMap = new Map(
      counts.map((c) => [c.userId.toString(), c._count._all]),
    );
  }

  return users.map((user) => {
    const idStr = user.id.toString();
    return {
      userId: idStr,
      userName: user.userName,
      displayName: user?.profile?.displayName || user.userName,
      avatar: user?.profile?.avatar || null,
      mutualFriendsCount: mutualMap.get(idStr) || 0,
      friendStatus: friendsSet.has(idStr), // true = đã là bạn, false = chưa
    };
  });
};

export const fillBaseProfileService = async (userId, userData) => {
  const { username, displayName, phoneNumber, gender, birthDay } = userData;
  const me = BigInt(userId);

  // Check username trùng TRƯỚC transaction — fail fast, không insert thừa Profile.
  // Loại self ra (an toàn nếu user submit lại form — BE idempotent).
  const userExists = await prisma.user.findFirst({
    where: {
      userName: username,
      id: { not: me },
    },
    select: { id: true },
  });
  if (userExists) {
    const err = new Error("Username already exists.");
    err.status = 409;
    throw err;
  }

  return await prisma.$transaction(async (tx) => {
    await tx.profile.create({
      data: {
        userId: me,
        displayName,
        phoneNumber,
        gender,
        birthDay: new Date(birthDay),
      },
    });

    // update User
    const updatedUser = await tx.user.update({
      where: { id: me },
      data: {
        isProfileComplete: true, // "Chìa khóa" để lần sau vào thẳng Home
        userName: username,
      },
      select: {
        id: true,
        email: true,
        userName: true,
        isProfileComplete: true,
        // Không trả về password ở đây nhé
      },
    });

    return updatedUser;
  });
};

// ============ FRIEND SUGGESTIONS (People You May Know — FB-like) ============
// Algorithm:
// 1. Build exclusion set: me + friends + pending requests (both ways) + blocks (both ways)
// 2. Fetch tối đa POOL_SIZE candidates NOT IN exclusion (newest first để bias toward
//    active users mới)
// 3. Bulk count mutual friends qua 1 groupBy query trên Friendship:
//    SELECT userId, COUNT(*) WHERE userId IN candidates AND friendId IN myFriends
// 4. Sort theo (mutualCount DESC, id DESC) — tie break theo recency
// 5. Take top `limit`

export const getFriendSuggestionsService = async ({ userId, limit }) => {
  const me = BigInt(userId);
  const take = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const POOL_SIZE = 100;

  // 1. Build exclusion set (parallel)
  const [myFriends, pendingRequests, blockList] = await Promise.all([
    getFriendIds(me),
    // Pending requests cả 2 chiều — lấy userId của bên kia
    prisma.friendRequest.findMany({
      where: {
        status: "pending",
        OR: [{ senderId: me }, { receiverId: me }],
      },
      select: { senderId: true, receiverId: true },
    }),
    getBlockListIds(me),
  ]);

  // Pending → list user khác
  const pendingIds = pendingRequests.map((r) =>
    r.senderId === me ? r.receiverId : r.senderId,
  );

  // Union tất cả exclusion (dedupe qua Set string)
  const exclusionSet = new Set([me.toString()]);
  myFriends.forEach((id) => exclusionSet.add(id.toString()));
  pendingIds.forEach((id) => exclusionSet.add(id.toString()));
  blockList.forEach((id) => exclusionSet.add(id.toString()));

  const exclusionIds = [...exclusionSet].map((id) => BigInt(id));

  // 2. Fetch candidate pool — newest first (id DESC) để bias active users
  const candidates = await prisma.user.findMany({
    where: {
      id: { notIn: exclusionIds },
      isDeleted: false,
    },
    take: POOL_SIZE,
    orderBy: { id: "desc" },
    select: {
      id: true,
      userName: true,
      profile: { select: { displayName: true, avatar: true } },
    },
  });

  if (candidates.length === 0) {
    return { data: [] };
  }

  // 3. Bulk count mutual friends — chỉ chạy nếu user có bạn
  // Mutual friends of candidate C = friends của C ∩ friends của me
  // Query: select userId, COUNT(*)
  //        from Friendship
  //        where userId in candidates and friendId in myFriends
  let mutualMap = new Map(); // candidateIdString → count
  if (myFriends.length > 0) {
    const counts = await prisma.friendship.groupBy({
      by: ["userId"],
      where: {
        userId: { in: candidates.map((c) => c.id) },
        friendId: { in: myFriends },
      },
      _count: { _all: true },
    });
    mutualMap = new Map(
      counts.map((c) => [c.userId.toString(), c._count._all]),
    );
  }

  // 4. Attach mutualCount + sort (mutualCount DESC, id DESC tie-break)
  const ranked = candidates
    .map((u) => ({
      id: u.id,
      userName: u.userName,
      displayName: u.profile?.displayName || u.userName,
      avatar: u.profile?.avatar || null,
      mutualFriendsCount: mutualMap.get(u.id.toString()) || 0,
    }))
    .sort((a, b) => {
      if (b.mutualFriendsCount !== a.mutualFriendsCount) {
        return b.mutualFriendsCount - a.mutualFriendsCount;
      }
      // Tie-break: newer id first (BigInt compare)
      return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
    });

  // 5. Take top N + serialize BigInt id
  const top = ranked.slice(0, take).map((u) => ({
    ...u,
    id: u.id.toString(),
  }));

  return { data: top };
};
