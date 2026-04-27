import express from "express";
import {
  createPost,
  deletePost,
  getPostById,
  getPosts,
  updatePost,
} from "../controllers/post.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { postSchema } from "../validations/post.schema.js";
import { uploadCloud } from "../config/cloudinary.js";
import reactionRoute from "./reaction.route.js";

const router = express.Router();

// nested routes — /posts/:postId/reactions
router.use("/:postId/reactions", reactionRoute);

// auth middleware đã được áp dụng global ở src/routes/index.route.js
router.post(
  "/",
  uploadCloud.fields([
    { name: "image", maxCount: 10 },
    { name: "video", maxCount: 1 },
  ]),
  validate(postSchema),
  createPost,
);

router.get("/", getPosts);

router.get("/:id", getPostById);

router.put(
  "/:id",
  uploadCloud.fields([
    { name: "image", maxCount: 10 },
    { name: "video", maxCount: 1 },
  ]),
  validate(postSchema),
  updatePost,
);

router.delete("/:id", deletePost);

export default router;
