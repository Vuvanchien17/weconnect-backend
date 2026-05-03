import {
  createCommentService,
  deleteCommentService,
  getCommentsService,
  getRepliesService,
  updateCommentService,
} from "../services/comment.service.js";

// POST /posts/:postId/comments
export const createComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, parentId } = req.body;
    const userId = req.user.id;

    const comment = await createCommentService(
      postId,
      userId,
      content,
      parentId,
    );

    return res.status(201).json({
      message: "Create comment successfully!",
      comment,
    });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// GET /posts/:postId/comments?cursor=&limit=&sort=newest|oldest
export const getComments = async (req, res) => {
  try {
    const { postId } = req.params;
    const { cursor, limit, sort } = req.query;

    const result = await getCommentsService({ postId, cursor, limit, sort });

    return res.status(200).json({
      message: "Get comments successfully!",
      ...result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// GET /comments/:id/replies?cursor=&limit=
export const getReplies = async (req, res) => {
  try {
    const { id } = req.params;
    const { cursor, limit } = req.query;

    const result = await getRepliesService({ commentId: id, cursor, limit });

    return res.status(200).json({
      message: "Get replies successfully!",
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

// PUT /comments/:id
export const updateComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    const updated = await updateCommentService(id, userId, content);

    return res.status(200).json({
      message: "Update comment successfully!",
      comment: updated,
    });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// DELETE /comments/:id
export const deleteComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await deleteCommentService(id, userId);

    return res.status(200).json({ message: "Delete comment successfully!" });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};
