import express from "express";
import { uploadCloud } from "../config/cloudinary.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createDirectConversationSchema,
  sendMessageSchema,
} from "../validations/conversation.schema.js";
import {
  createOrGetDirectConversation,
  listConversations,
  listMessages,
  markAsRead,
  sendMessage,
} from "../controllers/conversation.controller.js";

const router = express.Router();

// LƯU Ý THỨ TỰ: route specific (/direct) PHẢI đặt TRƯỚC route param (/:id/...)
// để Express không match nhầm /:id="direct".

router.post(
  "/direct",
  validate(createDirectConversationSchema),
  createOrGetDirectConversation,
);

router.get("/", listConversations);

router.get("/:id/messages", listMessages);

// Multer parse multipart trước, Zod validate body sau.
// `attachments` là field name FE gửi lên (max 10 file). Cloudinary auto detect type
// từ mimeType (image/video). PDF/file thường — cần config storage cho phép sau.
router.post(
  "/:id/messages",
  uploadCloud.array("attachments", 10),
  validate(sendMessageSchema),
  sendMessage,
);

router.patch("/:id/read", markAsRead);

export default router;
