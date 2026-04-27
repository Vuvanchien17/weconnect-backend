import { cloudinary } from "../config/cloudinary.js";
import {
  fillBaseProfileService,
  getMeService,
  getProfileByUserId,
  searchUsersService,
  updateProfileService,
} from "../services/user.service.js";

export const authMe = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await getMeService(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json({
      message: "Get user information successfully.",
      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Error in authMe:", error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const user = req?.user;
    const { deleteAvatar, deleteCoverImg, ...userData } = req.body;

    // check phoneNumber
    if (userData?.phoneNumber) {
      const userExist = await getProfileByPhoneNumber(userData?.phoneNumber);

      if (userExist && userExist.userId !== user.userId) {
        return res.status(409).json({
          message: "The phone number has already been used.",
        });
      }
    }

    // get old profile
    const oldProfile = await getProfileByUserId(user?.id);

    // TH1: user send new file
    if (req.files?.avatar) {
      userData.avatar = req.files.avatar?.[0].path;
      userData.avatarId = req.files.avatar?.[0].filename;

      if (oldProfile?.avatarId) {
        await cloudinary.uploader.destroy(oldProfile?.avatarId);
      }
    }

    if (req.files?.coverImage) {
      userData.coverImage = req.files.coverImage?.[0].path;
      userData.coverImageId = req.files.coverImage?.[0].filename;

      if (oldProfile?.coverImageId) {
        await cloudinary.uploader.destroy(oldProfile?.coverImageId);
      }
    }

    // TH2: user delete file
    if (deleteAvatar === true || deleteAvatar === "true") {
      if (oldProfile?.avatarId) {
        await cloudinary.uploader.destroy(oldProfile?.avatarId);
      }
      userData.avatar = null;
      userData.avatarId = null;
    }

    if (deleteCoverImg === true || deleteCoverImg === "true") {
      if (oldProfile?.coverImageId) {
        await cloudinary.uploader.destroy(oldProfile?.coverImageId);
      }
      userData.coverImage = null;
      userData.coverImageId = null;
    }

    // TH3: user update profile ignore file

    const newProfile = await updateProfileService(user?.id, userData);

    return res.status(200).json({
      message: "Update profile success!",
      data: {
        newProfile: newProfile,
      },
    });
  } catch (error) {
    console.log("Error update profile: ", error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

export const searchUsers = async (req, res) => {
  try {
    // according to convention
    const { q } = req.query;
    const currentUserId = req.user.id;

    if (!q || q.trim() === "") {
      return res.status(400).json({
        message: "Please enter username!",
      });
    }

    const users = await searchUsersService(q.trim(), currentUserId);
    res.status(200).json({
      message: users.length > 0 ? "Users found" : "User not found",
      listUsers: users,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

export const fillBaseProfile = async (req, res) => {
  try {
    const { displayName, phoneNumber, gender, birthDay } = req.body;
    const userId = req.user.id;

    if (!displayName || !phoneNumber || !gender || !birthDay) {
      return res.status(400).json({
        message: "Please fill in all the information",
      });
    }

    const updatedUser = await fillBaseProfileService(userId, req.body);

    return res.status(200).json({
      message: "Profile updated!",
      data: updatedUser,
    });
  } catch (error) {
    console.log("Error fill base profile: ", error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};
