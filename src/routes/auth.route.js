import express from "express";
import {
  changePassword,
  forgotPassword,
  refreshToken,
  resendOTP,
  resetPassword,
  signIn,
  signOut,
  signOutAll,
  signUp,
  verifyOTP,
} from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  changePasswordSchema,
  signUpSchema,
} from "../validations/user.schema.js";
import { protectedRoute } from "../middlewares/auth.middleware.js";
import { checkBlackList } from "../middlewares/checkBlackList.middleware.js";
import passport from "passport";
import { handleAuthCallback } from "../controllers/Oauth.controller.js";

const router = express.Router();

router.post("/signin", signIn);

router.post("/signup", validate(signUpSchema), signUp);

router.post("/signout", protectedRoute, checkBlackList, signOut); // chánh tấn công CSRF

router.post("/signout-all", protectedRoute, checkBlackList, signOutAll);

router.post("/refresh", refreshToken);

router.post("/forgot-password", forgotPassword);

router.post("/verify-otp", verifyOTP);

router.post("/reset-password", resetPassword);

router.post("/resend-otp", resendOTP);

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
  }),

  handleAuthCallback,
);

router.patch(
  "/change-password",
  protectedRoute,
  validate(changePasswordSchema),
  changePassword,
);

export default router;
