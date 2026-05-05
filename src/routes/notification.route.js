import express from "express";
import {
  deleteNotification,
  getNotifications,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
} from "../controllers/notification.controller.js";

const router = express.Router();

// LƯU Ý THỨ TỰ: route cụ thể (/unread-count, /read-all) PHẢI đặt TRƯỚC route có
// param (/:id/read, /:id) để Express không match nhầm.
// Vd: nếu /:id/read đặt trước /unread-count thì GET /unread-count sẽ match
// /:id/read với id="unread-count" → controller sai.

router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllAsRead);

router.get("/", getNotifications);
router.patch("/:id/read", markAsRead);
router.delete("/:id", deleteNotification);

export default router;
