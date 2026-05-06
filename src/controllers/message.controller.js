import {
  editMessageService,
  recallMessageService,
  removeMessageForMeService,
  toggleMessageReactionService,
} from "../services/conversation.service.js";

const handleError = (res, error, fallbackMsg = "Internal Server Error.") => {
  console.error(error);
  if (error.status) {
    return res.status(error.status).json({ message: error.message });
  }
  return res.status(500).json({ message: fallbackMsg });
};

// PUT /messages/:id — body { content }
// Edit text message. Chỉ owner sửa được. Image/file/system disallow.
export const editMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { content } = req.body;
    const message = await editMessageService({
      messageId: id,
      userId,
      content,
    });
    return res.status(200).json({
      message: "Message edited.",
      data: message,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// DELETE /messages/:id — recall (delete for everyone)
// Chỉ owner thu hồi. FE render "Tin nhắn đã thu hồi" cho mọi người.
export const recallMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await recallMessageService({ messageId: id, userId });
    return res.status(200).json({
      message: "Message recalled.",
      ...result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// DELETE /messages/:id/for-me — remove for me only
// User là participant (không cần sender) — chỉ ẩn phía mình.
export const removeMessageForMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await removeMessageForMeService({
      messageId: id,
      userId,
    });
    return res.status(200).json({
      message: "Message removed for you.",
      ...result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// POST /messages/:id/reactions — body { reactionId }
// Toggle / replace / add reaction (FB-like). 1 user 1 reaction / message.
export const toggleMessageReaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { reactionId } = req.body;
    const result = await toggleMessageReactionService({
      messageId: id,
      userId,
      reactionId,
    });
    return res.status(200).json({
      message: "Reaction updated.",
      ...result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
