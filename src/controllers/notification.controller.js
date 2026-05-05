import {
  deleteNotificationService,
  getNotificationsService,
  getUnreadCountService,
  markAllAsReadService,
  markAsReadService,
} from "../services/notification.service.js";

// GET /notifications?cursor=&limit=&unreadOnly=true
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { cursor, limit, unreadOnly } = req.query;

    const result = await getNotificationsService({
      userId,
      cursor,
      limit,
      unreadOnly,
    });

    return res.status(200).json({
      message: "Get notifications successfully.",
      ...result,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// GET /notifications/unread-count
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const count = await getUnreadCountService(userId);

    return res.status(200).json({
      message: "Get unread count successfully.",
      count,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// PATCH /notifications/:id/read
export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await markAsReadService(id, userId);

    return res.status(200).json({
      message: "Notification marked as read.",
    });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// PATCH /notifications/read-all
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await markAllAsReadService(userId);

    return res.status(200).json({
      message: "All notifications marked as read.",
      ...result, // { modifiedCount }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
};

// DELETE /notifications/:id
export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await deleteNotificationService(id, userId);

    return res.status(200).json({
      message: "Notification deleted successfully.",
    });
  } catch (error) {
    console.error(error);
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return res.status(500).json({ message: "Internal Server Error." });
  }
};
