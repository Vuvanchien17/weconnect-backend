import { toLowerCase } from "zod";
import prisma from "../config/prisma.js";
import Session from "../models/mongoDB/session.model.js";

export const verifyOrCreateUser = async (profile, provider, accessToken) => {
  const email = profile.emails?.[0]?.value;
  const providerAccountId = profile?.id;

  // check account
  const account = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: provider,
        providerAccountId: providerAccountId,
      },
    },
  });

  if (account) {
    return account.user;
  }

  // check user
  const user = await prisma.user.findUnique({
    where: {
      email: email,
    },
  });

  if (!user) {
    // create new (User + Account)
    await prisma.user.create({
      data: {
        email: email,
        accounts: {
          create: {
            provider: toLowerCase(provider),
            providerAccountId: providerAccountId,
            type: "oauth",
            accessToken: accessToken,
          },
        },
      },
    });
  } else {
    await prisma.account.create({
      data: {
        userId: user.id,
        provider: provider,
        providerAccountId: providerAccountId,
        type: "oauth",
        accessToken: accessToken,
      },
    });
  }

  return user;
};

export const createUserSession = async (user, refreshToken) => {
  await Session.create({
    userId: BigInt(user.id),
    refreshToken: refreshToken,
    expiresAt: new Date(Date.now() + Number(process.env.REFRESH_TOKEN_TTL)),
  });
};
