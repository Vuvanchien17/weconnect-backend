import {
  createOrGetDirectConversationService,
  listConversationsService,
  listMessagesService,
  markAsReadService,
  sendMessageService,
} from "../services/conversation.service.js";

const handleError = (res, error, fallbackMsg = "Internal Server Error.") => {
  console.error(error);
  if (error.status) {
    return res.status(error.status).json({ message: error.message });
  }
  return res.status(500).json({ message: fallbackMsg });
};

// POST /conversations/direct — body: { otherUserId }
// Idempotent: nếu đã có direct chat giữa current user và otherUser → return luôn.
export const createOrGetDirectConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otherUserId } = req.body;
    const conversation = await createOrGetDirectConversationService(
      userId,
      otherUserId,
    );
    return res.status(200).json({
      message: "Conversation ready.",
      data: conversation,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET /conversations?cursor=&limit=
export const listConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { cursor, limit } = req.query;
    const result = await listConversationsService({ userId, cursor, limit });
    return res.status(200).json({
      message: "Get conversations successfully.",
      ...result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET /conversations/:id/messages?cursor=&limit=
export const listMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { cursor, limit } = req.query;
    const result = await listMessagesService({
      conversationId: id,
      userId,
      cursor,
      limit,
    });
    return res.status(200).json({
      message: "Get messages successfully.",
      ...result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// POST /conversations/:id/messages — multipart: content, replyTo + attachments[]
// Multer parse files trước, Zod validate body sau.
export const sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { content, replyTo } = req.body;

    // Map req.files (multer + cloudinary) → attachments shape của Message schema
    const attachments = (req.files || []).map((f) => {
      let type = "file";
      if (f.mimetype?.startsWith("image/")) type = "image";
      else if (f.mimetype?.startsWith("video/")) type = "video";
      return {
        type,
        url: f.path,
        publicId: f.filename,
        fileName: f.originalname,
        mimeType: f.mimetype,
        size: f.size,
        // width/height: cloudinary có thể trả qua f.width/f.height tùy storage config
        width: f.width || null,
        height: f.height || null,
      };
    });

    const message = await sendMessageService({
      conversationId: id,
      senderId: userId,
      content,
      attachments,
      replyTo,
    });
    return res.status(201).json({
      message: "Message sent.",
      data: message,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// PATCH /conversations/:id/read — mark mọi message trong conversation là đã đọc
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await markAsReadService({ conversationId: id, userId });
    return res.status(200).json({
      message: "Marked as read.",
      ...result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
