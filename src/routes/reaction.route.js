import express from "express";
import {
  getPostReactions,
  reactToPost,
  removeReaction,
} from "../controllers/reaction.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { reactPostSchema } from "../validations/reaction.schema.js";

// mergeParams: true để truy cập :postId từ parent router (post.route.js)
const router = express.Router({ mergeParams: true });

router.post("/", validate(reactPostSchema), reactToPost);
router.delete("/", removeReaction);
router.get("/", getPostReactions);

export default router;
