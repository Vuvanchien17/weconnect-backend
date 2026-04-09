import express from "express";
import {
  authMe,
  fillBaseProfile,
  searchUsers,
  updateProfile,
} from "../controllers/user.controller.js";
import { uploadCloud } from "../config/cloudinary.js";
import { validate } from "../middlewares/validate.middleware.js";
import { profileSchema } from "../validations/profile.schema.js";

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

export default router;
