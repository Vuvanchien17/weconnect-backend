import prisma from "../config/prisma.js";

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

// ============ GET PROFILE BY ID (xem profile user khác) ============
// Khác với getMeService: KHÔNG trả email/phoneNumber/role/status (private fields).
//
// Block-aware: nếu giữa current user và target có quan hệ block (cả 2 chiều)
// → trả null (controller → 404, information hiding) — KHÔNG để lộ user tồn tại.
//
// Tự xem profile mình (targetUserId === currentUserId) cũng OK — FE simplify
// chỉ cần 1 endpoint `/users/:userId/profile` cho mọi case.
export const getUserProfileByIdService = async (
  targetUserId,
  currentUserId,
) => {
  const targetIdBig = BigInt(targetUserId);
  const meBig = BigInt(currentUserId);

  // 1. Check block 2 chiều — chỉ cần 1 row match là ẩn user
  // UserBlock dùng composite PK [blockerId, blockedId], không có id autoincrement.
  if (targetIdBig !== meBig) {
    const block = await prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: meBig, blockedId: targetIdBig },
          { blockerId: targetIdBig, blockedId: meBig },
        ],
      },
      select: { blockerId: true },
    });
    if (block) return null;
  }

  // 2. Join User + Profile (chỉ public fields)
  const user = await prisma.user.findFirst({
    where: { id: targetIdBig, isDeleted: false },
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
  const users = await prisma.user.findMany({
    where: {
      AND: [
        {
          OR: [
            {
              // find userName
              userName: { contains: keyword },
            },
            {
              // find displayName
              profile: {
                displayName: { contains: keyword },
              },
            },
          ],
        },
        { id: { not: BigInt(currentUserId) } },
        { isDeleted: false },
      ],
    },
    take: 10, // limit 10 user
    include: {
      profile: {
        select: {
          displayName: true,
          avatar: true,
        },
      },
    },
  });

  return users.map((user) => ({
    userId: user.id.toString(),
    userName: user.userName,
    displayName: user?.profile?.displayName || user.userName,
    avatar: user?.profile?.avatar || null,
  }));
};

export const fillBaseProfileService = async (userId, userData) => {
  const { displayName, phoneNumber, gender, birthDay } = userData;
  return await prisma.$transaction(async (tx) => {
    await tx.profile.create({
      data: {
        userId: userId,
        displayName,
        phoneNumber,
        gender,
        birthDay: new Date(userData.birthDay),
      },
    });

    // update User
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: {
        isProfileComplete: true, // "Chìa khóa" để lần sau vào thẳng Home
      },
      select: {
        id: true,
        email: true,
        isProfileComplete: true,
        // Không trả về password ở đây nhé
      },
    });

    return updatedUser;
  });
};
