import express from "express";
import {
  authMe,
  fillBaseProfile,
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

// Xem profile user khác (block-aware) — đặt TRƯỚC nestedUserFriendRoute
// để Express match /:userId/profile trước khi rơi vào sub-router.
router.get("/:userId/profile", getUserProfile);

// Nested routes — /users/:userId/friends + /users/:userId/friend-status
router.use("/:userId", nestedUserFriendRoute);

export default router;
