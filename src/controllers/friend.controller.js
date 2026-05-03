import {
  acceptFriendRequestService,
  blockUserService,
  cancelFriendRequestService,
  getBlocksService,
  getFriendStatusService,
  getFriendsService,
  getInboxService,
  getOutboxService,
  rejectFriendRequestService,
  sendFriendRequestService,
  unblockUserService,
  unfriendService,
} from "../services/friend.service.js";

// ============ FRIEND REQUEST ============

// POST /friend-requests
export const sendFriendRequest = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { receiverId } = req.body;

    const result = await sendFriendRequestService(senderId, receiverId);

    return res.status(201).json({
      message:
        result.type === "auto_matched"
          ? "You are now friends!"
          : "Friend request sent successfully.",
      ...result,
    });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// PATCH /friend-requests/:id/accept
export const acceptFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await acceptFriendRequestService(id, userId);

    return res.status(200).json({
      message: "Friend request accepted.",
      ...result,
    });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// PATCH /friend-requests/:id/reject
export const rejectFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await rejectFriendRequestService(id, userId);

    return res.status(200).json({ message: "Friend request rejected." });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// DELETE /friend-requests/:id  (sender hủy lời mời)
export const cancelFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await cancelFriendRequestService(id, userId);

    return res.status(200).json({ message: "Friend request cancelled." });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// GET /friend-requests/inbox?cursor=&limit=
export const getInbox = async (req, res) => {
  try {
    const userId = req.user.id;
    const { cursor, limit } = req.query;

    const result = await getInboxService({ userId, cursor, limit });

    return res.status(200).json({
      message: "Get inbox successfully.",
      ...result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// GET /friend-requests/outbox?cursor=&limit=
export const getOutbox = async (req, res) => {
  try {
    const userId = req.user.id;
    const { cursor, limit } = req.query;

    const result = await getOutboxService({ userId, cursor, limit });

    return res.status(200).json({
      message: "Get outbox successfully.",
      ...result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// ============ FRIEND ============

// GET /users/:userId/friends?cursor=&limit=
export const getFriends = async (req, res) => {
  try {
    const { userId } = req.params;
    const { cursor, limit } = req.query;

    const result = await getFriendsService({ userId, cursor, limit });

    return res.status(200).json({
      message: "Get friends successfully.",
      ...result,
    });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// DELETE /friends/:userId
export const unfriend = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { userId } = req.params;

    await unfriendService(currentUserId, userId);

    return res.status(200).json({ message: "Unfriend successfully." });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// GET /users/:userId/friend-status
export const getFriendStatus = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { userId } = req.params;

    const result = await getFriendStatusService(currentUserId, userId);

    return res.status(200).json({
      message: "Get friend status successfully.",
      ...result,
    });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// ============ BLOCK ============

// POST /blocks
export const blockUser = async (req, res) => {
  try {
    const blockerId = req.user.id;
    const { blockedId } = req.body;

    const result = await blockUserService(blockerId, blockedId);

    return res.status(201).json({
      message: "User blocked successfully.",
      ...result,
    });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// DELETE /blocks/:userId
export const unblockUser = async (req, res) => {
  try {
    const blockerId = req.user.id;
    const { userId } = req.params;

    await unblockUserService(blockerId, userId);

    return res.status(200).json({ message: "User unblocked successfully." });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// GET /blocks?cursor=&limit=
export const getBlocks = async (req, res) => {
  try {
    const userId = req.user.id;
    const { cursor, limit } = req.query;

    const result = await getBlocksService({ userId, cursor, limit });

    return res.status(200).json({
      message: "Get blocks successfully.",
      ...result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};
