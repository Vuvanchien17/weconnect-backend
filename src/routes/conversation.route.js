import express from "express";
import { uploadCloud } from "../config/cloudinary.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  addMembersSchema,
  changeMemberRoleSchema,
  createDirectConversationSchema,
  createGroupSchema,
  sendMessageSchema,
  updateGroupInfoSchema,
} from "../validations/conversation.schema.js";
import {
  addMembers,
  changeMemberRole,
  createGroupConversation,
  createOrGetDirectConversation,
  getConversationById,
  leaveGroup,
  listConversations,
  listMessages,
  markAsRead,
  removeMember,
  sendMessage,
  updateGroupInfo,
} from "../controllers/conversation.controller.js";

const router = express.Router();

// LƯU Ý THỨ TỰ: route specific (/direct, /group) PHẢI đặt TRƯỚC route param (/:id/...)
// để Express không match nhầm /:id="direct" hoặc /:id="group".

// ============ DIRECT (Step 2a) ============
router.post(
  "/direct",
  validate(createDirectConversationSchema),
  createOrGetDirectConversation,
);

// ============ GROUP CREATE (Step 2c) ============
// Multipart: name, description, memberIds, avatar (file optional)
router.post(
  "/group",
  uploadCloud.fields([{ name: "avatar", maxCount: 1 }]),
  validate(createGroupSchema),
  createGroupConversation,
);

// ============ LIST CONVERSATIONS (Step 2a) ============
router.get("/", listConversations);

// ============ MESSAGES (Step 2a) ============
router.get("/:id/messages", listMessages);

router.post(
  "/:id/messages",
  uploadCloud.array("attachments", 10),
  validate(sendMessageSchema),
  sendMessage,
);

router.patch("/:id/read", markAsRead);

// ============ GROUP MANAGEMENT (Step 2c) ============
// Note: /:id/leave và /:id/members/* phải đặt TRƯỚC /:id (GET) để Express match đúng
// — nhưng vì path khác nhau (suffix /leave, /members) nên không xung đột với /:id base.

// Update group info (admin only) — multipart cho avatar
router.patch(
  "/:id/group",
  uploadCloud.fields([{ name: "avatar", maxCount: 1 }]),
  validate(updateGroupInfoSchema),
  updateGroupInfo,
);

// Self leave group
router.delete("/:id/leave", leaveGroup);

// Member management (admin only)
router.post(
  "/:id/members",
  validate(addMembersSchema),
  addMembers,
);
router.delete("/:id/members/:userId", removeMember);
router.patch(
  "/:id/members/:userId/role",
  validate(changeMemberRoleSchema),
  changeMemberRole,
);

// ============ GET CONVERSATION DETAIL (Step 2c) ============
// Đặt cuối — fallback match cho mọi /:id còn lại (sau khi specific paths đã match).
router.get("/:id", getConversationById);

export default router;
