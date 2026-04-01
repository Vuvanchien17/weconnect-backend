import { createUserSession } from "../services/Oauth.service.js";

export const handleAuthCallback = async (req, res) => {
  try {
    const user = req.user;

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
      sameSite: "lax", // avoid attack CSRF
      maxAge: Number(process.env.REFRESH_TOKEN_TTL),
      path: "/",
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5000";
    const redirectUrl = `${frontendUrl}/auth-success?accessToken=${accessToken}`;
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("OAuth Callback Error:", error);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5000";
    return res.redirect(`${frontendUrl}/signin?error=oauth_failed`);
  }
};
