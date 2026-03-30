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
