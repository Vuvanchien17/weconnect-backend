import { createFullPostService } from "../services/post.service.js";

export const createPost = async (req, res) => {
  try {
    console.log(req.body);
    const { privacyId, taggedUserIds, collabUserIds, blocks } = req.body;
    const userId = req.user.id;

    const newPost = await createFullPostService(
      req?.files,
      userId,
      privacyId,
      blocks,
      taggedUserIds,
      collabUserIds,
    );
    return res.status(201).json({
      message: "Create post successfully!",
      post: newPost,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};
