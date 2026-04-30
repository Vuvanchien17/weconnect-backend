import {
  getPostReactionsService,
  reactToPostService,
  removeReactionService,
} from "../services/reaction.service.js";

export const reactToPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { reactionId } = req.body;
    const userId = req.user.id;

    const result = await reactToPostService(postId, userId, reactionId);

    return res.status(200).json({
      message: "React successfully!",
      reaction: result,
    });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

export const removeReaction = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    await removeReactionService(postId, userId);

    return res.status(200).json({ message: "Remove reaction successfully!" });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

export const getPostReactions = async (req, res) => {
  try {
    const { postId } = req.params;
    const { type, page, limit } = req.query;

    const result = await getPostReactionsService({
      postId,
      type,
      page,
      limit,
    });

    return res.status(200).json({
      message: "Get reactions successfully!",
      ...result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};
