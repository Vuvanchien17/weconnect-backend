import express from "express";
import {
  createComment,
  deleteComment,
  getComments,
  getReplies,
  updateComment,
} from "../controllers/comment.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createCommentSchema,
  updateCommentSchema,
} from "../validations/comment.schema.js";

// =============================================================
// Nested router — mount tại /posts/:postId/comments (trong post.route.js)
// mergeParams: true để truy cập :postId từ parent router
// =============================================================
export const nestedCommentRoute = express.Router({ mergeParams: true });

nestedCommentRoute.post("/", validate(createCommentSchema), createComment);
nestedCommentRoute.get("/", getComments);

// =============================================================
// Top-level router — mount tại /comments (trong index.route.js)
// Operation lên 1 comment cụ thể: list replies, update, delete
// =============================================================
const commentRoute = express.Router();

commentRoute.get("/:id/replies", getReplies);
commentRoute.put("/:id", validate(updateCommentSchema), updateComment);
commentRoute.delete("/:id", deleteComment);

export default commentRoute;
