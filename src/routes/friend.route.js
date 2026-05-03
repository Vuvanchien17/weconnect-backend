import express from "express";
import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  getBlocks,
  getFriendStatus,
  getFriends,
  getInbox,
  getOutbox,
  rejectFriendRequest,
  sendFriendRequest,
  unblockUser,
  unfriend,
} from "../controllers/friend.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  blockUserSchema,
  sendFriendRequestSchema,
} from "../validations/friend.schema.js";

// =============================================================
// 1) Friend Request router — mount tại /friend-requests
// =============================================================
export const friendRequestRoute = express.Router();

friendRequestRoute.post(
  "/",
  validate(sendFriendRequestSchema),
  sendFriendRequest,
);
friendRequestRoute.get("/inbox", getInbox);
friendRequestRoute.get("/outbox", getOutbox);
friendRequestRoute.patch("/:id/accept", acceptFriendRequest);
friendRequestRoute.patch("/:id/reject", rejectFriendRequest);
friendRequestRoute.delete("/:id", cancelFriendRequest);

// =============================================================
// 2) Friendship router — mount tại /friends
// (chỉ DELETE /:userId — unfriend)
// =============================================================
export const friendshipRoute = express.Router();

friendshipRoute.delete("/:userId", unfriend);

// =============================================================
// 3) Block router — mount tại /blocks
// =============================================================
export const blockRoute = express.Router();

blockRoute.post("/", validate(blockUserSchema), blockUser);
blockRoute.get("/", getBlocks);
blockRoute.delete("/:userId", unblockUser);

// =============================================================
// 4) Nested router cho user — mount vào /users/:userId/...
// (mergeParams để truy cập :userId từ parent)
// =============================================================
export const nestedUserFriendRoute = express.Router({ mergeParams: true });

// GET /users/:userId/friends
nestedUserFriendRoute.get("/friends", getFriends);
// GET /users/:userId/friend-status
nestedUserFriendRoute.get("/friend-status", getFriendStatus);
