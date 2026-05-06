import express from "express";
import { validate } from "../middlewares/validate.middleware.js";
import {
  editMessageSchema,
  reactMessageSchema,
} from "../validations/conversation.schema.js";
import {
  editMessage,
  recallMessage,
  removeMessageForMe,
  toggleMessageReaction,
} from "../controllers/message.controller.js";

const router = express.Router();

// LƯU Ý THỨ TỰ:
// - DELETE /:id/for-me phải đặt TRƯỚC DELETE /:id để Express match đúng
//   (Express match theo thứ tự đăng ký, /:id sẽ match cả "for-me" nếu đặt trước)
// - POST /:id/reactions tương tự — đặt riêng path không xung đột với base /:id

// Edit message (chỉ text + chỉ owner)
router.put("/:id", validate(editMessageSchema), editMessage);

// Remove for me — phải TRƯỚC route DELETE /:id base
router.delete("/:id/for-me", removeMessageForMe);

// Recall (delete for everyone — chỉ owner)
router.delete("/:id", recallMessage);

// Toggle reaction (FB-like 1 user 1 reaction / message)
router.post("/:id/reactions", validate(reactMessageSchema), toggleMessageReaction);

export default router;
