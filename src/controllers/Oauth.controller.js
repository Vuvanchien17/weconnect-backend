import { createUserSession } from "../services/Oauth.service.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";

export const handleAuthCallback = async (req, res) => {
  try {
    const user = req.user;

    // check state of Profile
    const isComplete = user.isProfileComplete;

    // create JWT for user using Weconnect
    const accessToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET_KEY,
      { expiresIn: process.env.ACCESS_TOKEN_TTL }, // option config
    );

    // create refreshToken
    const refreshToken = crypto.randomBytes(64).toString("hex");

    const userSession = await createUserSession(user, refreshToken);

    res.cookie("refreshToken", refreshToken, {
      // haved in express
      httpOnly: true, // avoid attack XSS
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // avoid attack CSRF
      maxAge: Number(process.env.REFRESH_TOKEN_TTL),
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const redirectUrl = `${frontendUrl}/auth-success?accessToken=${accessToken}&isComplete=${isComplete}`;
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("OAuth Callback Error:", error);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5000";
    return res.redirect(`${frontendUrl}/signin?error=oauth_failed`);
  }
};
