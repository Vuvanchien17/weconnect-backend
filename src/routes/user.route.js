import express from "express";
import {
  authMe,
  fillBaseProfile,
  getFriendSuggestions,
  getUserProfile,
  searchUsers,
  updateProfile,
} from "../controllers/user.controller.js";
import { uploadCloud } from "../config/cloudinary.js";
import { validate } from "../middlewares/validate.middleware.js";
import { profileSchema } from "../validations/profile.schema.js";
import { nestedUserFriendRoute } from "./friend.route.js";

const router = express.Router();

router.get("/me", authMe);
router.put(
  "/profile",
  uploadCloud.fields([
    { name: "avatar", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  validate(profileSchema),
  updateProfile,
);

router.post("/infor", fillBaseProfile);

router.get("/search", searchUsers);

// Friend suggestions (FB-like "People you may know") — literal path, đặt TRƯỚC /:userId
router.get("/suggestions", getFriendSuggestions);

// Xem profile user khác theo USERNAME (block-aware) — đặt TRƯỚC nestedUserFriendRoute
// để Express match /:username/profile trước khi rơi vào sub-router.
// Note: friend nested routes vẫn dùng /:userId (BigInt id), không username.
// FE lấy id từ response profile để gọi friend endpoints.
router.get("/:username/profile", getUserProfile);

// Nested routes — /users/:userId/friends + /users/:userId/friend-status
router.use("/:userId", nestedUserFriendRoute);

export default router;
