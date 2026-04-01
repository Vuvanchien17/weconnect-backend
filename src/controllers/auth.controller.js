import bcrypt from "bcryptjs";
import { getUserById } from "../services/user.service.js";
import {
  changePasswordService,
  forgotPasswordService,
  refreshTokenService,
  resendOTPService,
  resetPasswordService,
  signInService,
  signOutService,
  signUpService,
  verifyOTPService,
} from "./../services/auth.service.js";
import jwt from "jsonwebtoken";
import redisClient from "../config/redis.js";

// function signUp
export const signUp = async (req, res) => {
  try {
    const { email, password } = req.body;

    // check user fill all the infomation ?
    if (!email || !password) {
      return res.status(400).json({
        message: "You need to fill in all the infomation.",
      }); // status 400: Bad request
    }

    const newUser = await signUpService(req.body); // gặp lỗi sẽ nhảy xuống catch(error)
    return res.status(201).json({
      message: "Register successful!",
      data: { userId: newUser.id },
    });
  } catch (error) {
    if (error.message === "username exists.") {
      return res.status(409).json({
        message: "The username already exists.",
      });
    }

    if (error.message === "email exists.") {
      return res.status(409).json({
        message: "The email already exists.",
      });
    }

    console.log("Register error: ", error);
    return res.status(500).json({
      message: "Internal Server Error.",
    });
  }
};

// function signIn
export const signIn = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        message: "You need to fill in all the infomation.",
      });
    }

    const { refreshToken, accessToken, user } = await signInService(req.body);
    if (refreshToken) {
      // give refreshToken to cookie
      res.cookie("refreshToken", refreshToken, {
        // haved in express
        httpOnly: true, // avoid attack XSS
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict", // avoid attack CSRF
        maxAge: Number(process.env.REFRESH_TOKEN_TTL),
      });

      return res.status(200).json({
        message: "Login successful!",
        data: {
          accessToken: accessToken,
          user: { id: user.id, username: user.userName },
        },
      });
    } else {
      throw new Error("Login failed!");
    }
  } catch (error) {
    if (error.message === "user does not exist") {
      return res.status(401).json({
        message: "Incorrect username or password.",
      });
    }

    console.log("Login error: ", error);
    return res.status(500).json({
      message: "Internal Server Error.",
    });
  }
};

// function signOut
export const signOut = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    const userId = req.user?.id;
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "Token not exists!" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.decode(token);
    const timeLeft = decoded.exp - Math.floor(Date.now() / 1000);

    if (timeLeft > 0) {
      await redisClient.setEx(`blacklist:${token}`, timeLeft, "true");
    }

    if (refreshToken && userId) {
      await signOutService(refreshToken, userId);
    }
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: true, // true nếu dùng https
      sameSite: "strict",
    });

    return res.status(200).json({
      message: "Sign out successfully.",
    });
  } catch (error) {
    console.log("Logout error: ", error);
    return res.status(500).json({
      message: "Internal Server Error.",
    });
  }
};

// function refreshToken
export const refreshToken = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        message: "No refresh token provided",
      });
    }

    const newAccessToken = await refreshTokenService(refreshToken);
    return res.status(200).json({
      message: "Token refreshed!",
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.log("Refresh error:", error.message);
    res.clearCookie("refreshToken");
    return res.status(403).json({
      message: "Session expired. Please login again.",
    });
  }
};

// function changePassword
export const changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    const user = await getUserById(req?.user?.id);
    console.log(user);
    // check match password
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({
        message: "Password incorrect",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "Confirm password incorrect",
      });
    }

    await changePasswordService(user?.id, newPassword);
    return res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.log("Error change password: ", error);
    return res.status(500).json({
      message: "Internal Server Error.",
    });
  }
};

// function forgot-password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await forgotPasswordService(email);
    return res.status(200).json({
      message: "Send OTP successfully",
      result: result,
    });
  } catch (error) {
    if (error.message === "Email not exists") {
      return res.status(422).json({
        message: "Email not exists",
      });
    } else if (
      error.message ===
      "Unable to send emails at this time. Please try again later!"
    ) {
      return res.status(500).json({
        message: "Email not exists",
      });
    }

    return res.status(500).json({
      message: "Internal Server Error.",
    });
  }
};

// function verify-otp
export const verifyOTP = async (req, res) => {
  try {
    const { otp, email } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required!" });
    }

    const result = await verifyOTPService(otp, email);
    return res.status(200).json({
      message: "Verify OTP successfully",
      result: result,
    });
  } catch (error) {
    if (error.message) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({
      message: "Internal Server Error.",
    });
  }
};

// function reset-password
export const resetPassword = async (req, res) => {
  try {
    const { email, newPassword, resetToken } = req.body;
    if (!email || !newPassword || !resetToken) {
      return res.status(400).json({
        message: "You need to enter all the information",
      });
    }

    const hashedPassword = await resetPasswordService(
      email,
      newPassword,
      resetToken,
    );

    if (hashedPassword) {
      return res.status(200).json({
        message: "Reset password successfully",
        result: hashedPassword,
      });
    }
  } catch (error) {
    if (error.message) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Internal Server Error.",
    });
  }
};

// function resend-otp
export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        message: "Bad request",
      });
    }

    const result = await resendOTPService(email);

    if (result) {
      return res.status(200).json({
        message: "Resend otp successfully",
        result: result,
      });
    }
  } catch (error) {
    if (error.message) {
      return res.status(400).json({
        message: error.message,
      });
    }

    return res.status(500).json({
      message: "Internal Server Error.",
    });
  }
};
