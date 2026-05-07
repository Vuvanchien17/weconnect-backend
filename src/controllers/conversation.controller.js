import {
  addMembersService,
  changeMemberRoleService,
  createGroupConversationService,
  createOrGetDirectConversationService,
  getConversationByIdService,
  leaveGroupService,
  listConversationsService,
  listMessagesService,
  markAsReadService,
  removeMemberService,
  sendMessageService,
  updateGroupInfoService,
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

// ============================================================
// STEP 2c — GROUP CHAT
// ============================================================

// POST /conversations/group — multipart: name, description, memberIds, avatar
// Multer parse files (avatar single), Zod validate body sau.
export const createGroupConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description, memberIds } = req.body;
    const avatarFile = req.files?.avatar?.[0] || null;

    const conversation = await createGroupConversationService({
      creatorId: userId,
      name,
      description,
      memberIds,
      avatarFile,
    });
    return res.status(201).json({
      message: "Group created.",
      data: conversation,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET /conversations/:id — full detail (members list, my role,...)
// Dùng cho group settings page hoặc generic conversation detail.
export const getConversationById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const conversation = await getConversationByIdService({
      conversationId: id,
      userId,
    });
    return res.status(200).json({
      message: "Get conversation successfully.",
      data: conversation,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// PATCH /conversations/:id/group — multipart: name?, description?, avatar?
// Admin only. Ít nhất 1 field thay đổi.
export const updateGroupInfo = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, description } = req.body;
    const avatarFile = req.files?.avatar?.[0] || null;

    const conversation = await updateGroupInfoService({
      conversationId: id,
      userId,
      name,
      description,
      avatarFile,
    });
    return res.status(200).json({
      message: "Group updated.",
      data: conversation,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// POST /conversations/:id/members — body { memberIds: [...] }
// Admin only. Multi-add. Re-add user cũ đã leftAt cũng work.
export const addMembers = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { memberIds } = req.body;
    const conversation = await addMembersService({
      conversationId: id,
      userId,
      memberIds,
    });
    return res.status(200).json({
      message: "Members added.",
      data: conversation,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// DELETE /conversations/:id/members/:userId — kick member (admin only)
export const removeMember = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id, userId: targetUserId } = req.params;
    const conversation = await removeMemberService({
      conversationId: id,
      userId,
      targetUserId,
    });
    return res.status(200).json({
      message: "Member removed.",
      data: conversation,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// DELETE /conversations/:id/leave — self leave group
export const leaveGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await leaveGroupService({ conversationId: id, userId });
    return res.status(200).json({
      message: "Left group successfully.",
      ...result,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// PATCH /conversations/:id/members/:userId/role — admin promote/demote
// body { role: "admin" | "member" }
export const changeMemberRole = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id, userId: targetUserId } = req.params;
    const { role } = req.body;
    const conversation = await changeMemberRoleService({
      conversationId: id,
      userId,
      targetUserId,
      role,
    });
    return res.status(200).json({
      message: "Role updated.",
      data: conversation,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
