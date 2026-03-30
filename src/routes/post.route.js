import express from "express";
import { createPost } from "../controllers/post.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { postSchema } from "../validations/post.schema.js";
import { uploadCloud } from "../config/cloudinary.js";

const router = express.Router();

router.post(
  "/",
  uploadCloud.fields([
    { name: "image", maxCount: 10 },
    { name: "video", maxCount: 1 },
  ]),
  validate(postSchema),
  createPost,
);

export default router;
