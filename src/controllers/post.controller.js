import { json } from "zod";
import {
  createFullPostService,
  deletePostService,
  getPostByIdService,
  getPostsService,
  updateFullPostService,
} from "../services/post.service.js";

export const createPost = async (req, res) => {
  try {
    const { privacyId, taggedUserIds, collabUserIds, blocks } = req.body;
    const userId = req.user.id;
    console.log(typeof blocks);
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
    console.error("Error:", error.message);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

export const getPostById = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id;
    const post = await getPostByIdService(id, currentUserId);

    if (!post) {
      return res.status(404).json({ message: "Post not found." });
    }

    return res.status(200).json({
      message: "Get post successfully!",
      post,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

export const getPosts = async (req, res) => {
  try {
    const { userId, cursor, limit } = req.query;
    const currentUserId = req.user.id;
    const result = await getPostsService({
      userId,
      cursor,
      limit,
      currentUserId,
    });

    return res.status(200).json({
      message: "Get posts successfully!",
      ...result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

export const updatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { privacyId, taggedUserIds, collabUserIds, blocks } = req.body;
    const userId = req.user.id;

    const updated = await updateFullPostService(
      req?.files,
      id,
      userId,
      privacyId,
      blocks,
      taggedUserIds,
      collabUserIds,
    );

    return res.status(200).json({
      message: "Update post successfully!",
      post: updated,
    });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

export const deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await deletePostService(id, userId);

    return res.status(200).json({ message: "Delete post successfully!" });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};
