import prisma from "../config/prisma.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import Session from "../models/mongoDB/session.model.js";
import redisClient from "../config/redis.js";
import otpTemplate from "../utils/mailTemplate.js";
import transporter from "../config/mail.js";

// function signUp
export const signUpService = async (userData) => {
  const { email, password } = userData;

  const emailLowerCase = email.toLowerCase().trim();
  const userExists = await prisma.user.findFirst({
    where: {
      email: emailLowerCase,
    },
  });

  if (userExists) {
    if (userExists.email === emailLowerCase) {
      throw new Error("email exists.");
    }
  }

  // create new user
  // hashPassword
  const saltRound = 10;
  const passwordHash = await bcrypt.hash(password, saltRound);
  // create new User
  const newUser = await prisma.user.create({
    data: {
      email: emailLowerCase,
      passwordHash,
    },
  });
  return newUser;
};

// function signIn
export const signInService = async (userData) => {
  const { email, password } = userData;

  const emailLowerCase = email.toLowerCase().trim();
  const userExists = await prisma.user.findFirst({
    where: {
      email: emailLowerCase,
    },
  });

  // check userExists
  if (!userExists) {
    throw new Error("user does not exist");
  }

  const passwordCorrect = await bcrypt.compare(
    password,
    userExists.passwordHash,
  );
  if (!passwordCorrect) {
    throw new Error("user does not exist");
  }

  // if match, create accessToken JWT
  const accessToken = jwt.sign(
    { userId: userExists.id },
    process.env.JWT_SECRET_KEY,
    { expiresIn: process.env.ACCESS_TOKEN_TTL }, // option config
  );

  // create refreshToken
  const refreshToken = crypto.randomBytes(64).toString("hex");

  // create new Session to save refreshToken
  const userSession = await Session.create({
    userId: BigInt(userExists?.id),
    refreshToken: refreshToken,
    expiresAt: new Date(Date.now() + Number(process.env.REFRESH_TOKEN_TTL)),
  });

  return {
    refreshToken: refreshToken,
    accessToken: accessToken,
    user: userExists,
  };
};

// function signOut
export const signOutService = async (refreshToken, userId) => {
  // delete user Session
  return await Session.deleteOne({
    userId: BigInt(userId),
    refreshToken: refreshToken,
  });
};

// function refreshTokenService

export const refreshTokenService = async (refreshToken) => {
  // find session in database
  const userSession = await Session.findOne({ refreshToken });

  // check exist or expires
  if (!userSession || userSession?.expiresAt < new Date()) {
    if (userSession) {
      await Session.deleteOne({ refreshToken: refreshToken });
    }
    throw new Error("Refresh token invalid or expired");
  }

  // create new accessToken
  const newAccessToken = jwt.sign(
    { userId: userSession?.userId },
    process.env.JWT_SECRET_KEY,
    { expiresIn: process.env.ACCESS_TOKEN_TTL }, // option config
  );

  return newAccessToken;
};

// function changePassword
export const changePasswordService = async (userId, newPassword) => {
  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  const newUser = await prisma.user.update({
    where: {
      id: BigInt(userId),
    },
    data: {
      passwordHash: newPasswordHash,
    },
  });
  return newUser;
};

// function forgot-password
export const forgotPasswordService = async (email) => {
  // 1. Kiểm tra user tồn tại
  const emailLowerCase = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({
    where: {
      email: emailLowerCase,
    },
  });

  if (!user) {
    throw new Error("Email not exists");
  }

  // 2. Tạo OTP
  const OTP = Math.floor(100000 + Math.random() * 900000);

  // 3. Lưu OTP vào Redis
  await redisClient.setEx(`otp:${emailLowerCase}`, 300, OTP.toString());

  // 4. Gửi mail (dùng file mail.js bạn đã có)
  const mailOptions = {
    from: "Weconnect",
    to: emailLowerCase,
    subject: "Mã OTP khôi phục mật khẩu - WeConnect",
    html: otpTemplate(OTP),
  };

  try {
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    await redisClient.del(`otp:${emailLowerCase}`);
    throw new Error(
      "Unable to send emails at this time. Please try again later!",
    );
  }
};

// function verify-otp
export const verifyOTPService = async (OTPCode, email) => {
  const emailLowerCase = email.toLowerCase().trim();
  const retryKey = `otp_retries:${emailLowerCase}`;
  const otpKey = `otp:${emailLowerCase}`;

  // check isLock?
  const retries = await redisClient.get(retryKey);
  if (retries && parseInt(retries) >= 5) {
    await redisClient.del(otpKey);
    throw new Error("Your account is locked. Please try again in 5 minutes");
  }

  const storedOTP = await redisClient.get(otpKey);

  if (!storedOTP) {
    throw new Error("The OTP code has expired or does not exist");
  }

  // logic when enter error
  if (storedOTP !== OTPCode) {
    const currentRetries = await redisClient.incr(retryKey);

    if (currentRetries === 1) {
      await redisClient.expire(retryKey, 300); // lock 5p
    }

    const remaining = 5 - currentRetries;
    if (remaining <= 0) {
      throw new Error(
        "You have entered the wrong information more than 5 times. Your account will be temporarily suspended for 5 minutes",
      );
    }
    throw new Error(`OTP code incorrect, you have ${remaining} more attempts`);
  }

  // create resetToken return for user
  const resetToken = crypto.randomBytes(32).toString("hex");

  // expire 15p
  await redisClient.setEx(`resetToken:${emailLowerCase}`, 900, resetToken);

  // if match OTP code => delete OTP code and retryKey
  await redisClient.del(otpKey);
  await redisClient.del(retryKey);

  return resetToken;
};

//function reset-password
export const resetPasswordService = async (email, newPassword, resetToken) => {
  // Check resetToken in redis
  const emailLowerCase = email.toLowerCase().trim();
  const storedToken = await redisClient.get(`resetToken:${emailLowerCase}`);

  if (!storedToken || storedToken !== resetToken) {
    throw new Error("Invalid or expired token");
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  // update table User
  await prisma.user.update({
    where: {
      email: emailLowerCase,
    },
    data: {
      passwordHash: hashedPassword,
    },
  });

  // del token in redis
  await redisClient.del(`resetToken:${emailLowerCase}`);

  return hashedPassword;
};

// function resend-otp
export const resendOTPService = async (email) => {
  const emailLowerCase = email.toLowerCase().trim();
  const cooldownKey = `otp_cooldown:${emailLowerCase}`;
  const retryKey = `otp_retries:${emailLowerCase}`;

  // resend after 60s
  const isCooldown = await redisClient.get(cooldownKey);
  if (isCooldown) {
    throw new Error("Please wait 60 seconds before requesting a new code");
  }

  // check account isLock?
  const retriesOTP = await redisClient.get(retryKey);
  if (!retriesOTP || parseInt(retriesOTP) >= 5) {
    throw new Error("Your account is locked. Please try again in 5 minutes");
  }

  // delete old otp
  await redisClient.del(`otp:${emailLowerCase}`);

  // create new otp
  const OTP = Math.floor(100000 + Math.random() * 900000);

  // save new otp into Redis
  await redisClient.setEx(`otp:${emailLowerCase}`, 300, OTP.toString());

  const mailOptions = {
    from: "Weconnect",
    to: emailLowerCase,
    subject: "Mã OTP khôi phục mật khẩu - WeConnect",
    html: otpTemplate(OTP),
  };

  // await transporter.sendMail(mailOptions);
  try {
    // establish cooldown 60s in Redis
    await redisClient.setEx(cooldownKey, 60, "true");

    return await transporter.sendMail(mailOptions);
  } catch (error) {
    await redisClient.del(`otp:${emailLowerCase}`);
    throw new Error(
      "Unable to send emails at this time. Please try again later!",
    );
  }
};

export const signOutAllService = async (userId) => {
  return await Session.deleteMany({ userId: userId });
};
