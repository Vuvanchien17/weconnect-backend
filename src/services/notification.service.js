import mongoose from "mongoose";
import Notification from "../models/mongoDB/notification.model.js";
import prisma from "../config/prisma.js";
import { emitToUser } from "../config/socket.js";

// ============ HELPERS ============

// Chuẩn hóa shape notification trả về FE — đã kèm actor info đầy đủ.
// FE chỉ cần `actor.displayName` + `actor.avatar` để render ngay.
const formatNotification = (noti, actor) => ({
  id: noti._id.toString(),
  type: noti.type,
  payload: noti.payload || {},
  isRead: noti.isRead,
  actor: actor
    ? {
        id: actor.id,
        userName: actor.userName,
        displayName: actor.profile?.displayName || actor.userName,
        avatar: actor.profile?.avatar || null,
      }
    : null,
  createdAt: noti.createdAt,
});

// Bulk-fetch actor info từ MySQL cho 1 list notifications.
// Chống N+1: 1 query duy nhất cho tất cả distinct actorIds.
// Trả về Map<actorId(string), actorObject>
const buildActorMap = async (actorIds) => {
  if (actorIds.length === 0) return new Map();

  const distinctIds = [...new Set(actorIds.map((id) => id.toString()))];
  const actors = await prisma.user.findMany({
    where: { id: { in: distinctIds.map((id) => BigInt(id)) } },
    select: {
      id: true,
      userName: true,
      profile: { select: { displayName: true, avatar: true } },
    },
  });
  return new Map(actors.map((a) => [a.id.toString(), a]));
};

// ============ CREATE NOTIFICATION (utility — gọi từ trigger points) ============
// Pattern: persist Mongo trước, emit Socket.io sau (best-effort).
//
// Self-action filter: nếu actorId === userId → return null (skip).
//   Vd: user react post của chính mình → không noti.
//
// Return: formatted notification (đã kèm actor info), hoặc null nếu skip.
export const createNotificationService = async ({
  userId,
  actorId,
  type,
  payload = {},
}) => {
  const userIdBig = BigInt(userId);
  const actorIdBig = BigInt(actorId);

  // Self-action filter
  if (userIdBig === actorIdBig) return null;

  // 1. Persist Mongo
  const noti = await Notification.create({
    userId: userIdBig,
    actorId: actorIdBig,
    type,
    payload,
  });

  // 2. Lookup actor info để emit kèm (FE render avatar/displayName ngay)
  const actor = await prisma.user.findUnique({
    where: { id: actorIdBig },
    select: {
      id: true,
      userName: true,
      profile: { select: { displayName: true, avatar: true } },
    },
  });

  const formatted = formatNotification(noti, actor);

  // 3. Emit Socket.io (best-effort, không rollback nếu fail)
  emitToUser(userIdBig, "notification:new", formatted);

  return formatted;
};

// ============ LIST NOTIFICATIONS (cursor pagination) ============
// Cursor = _id của notification cuối cùng đã load.
// MongoDB ObjectId có timestamp embed → sort theo _id DESC tương đương createdAt DESC.
//
// unreadOnly: nếu true, chỉ trả về noti chưa đọc (cho tab "Unread" trên UI).
export const getNotificationsService = async ({
  userId,
  cursor,
  limit,
  unreadOnly,
}) => {
  const take = Math.min(Math.max(Number(limit) || 10, 1), 50);

  const where = {
    userId: BigInt(userId),
    ...(unreadOnly === "true" || unreadOnly === true ? { isRead: false } : {}),
    ...(cursor && { _id: { $lt: new mongoose.Types.ObjectId(cursor) } }),
  };

  const notifications = await Notification.find(where)
    .sort({ _id: -1 })
    .limit(take + 1)
    .lean();

  const hasNext = notifications.length > take;
  const items = hasNext ? notifications.slice(0, take) : notifications;
  const nextCursor = hasNext ? items[items.length - 1]._id.toString() : null;

  // Bulk fetch actor info cho tất cả notifications
  const actorMap = await buildActorMap(items.map((n) => n.actorId));

  return {
    data: items.map((n) =>
      formatNotification(n, actorMap.get(n.actorId.toString())),
    ),
    metadata: { limit: take, nextCursor, hasNext },
  };
};

// ============ COUNT UNREAD ============
// Dùng cho badge `🔔 3` trên header. Gọi rất thường xuyên (mỗi khi user vào page).
export const getUnreadCountService = async (userId) => {
  const count = await Notification.countDocuments({
    userId: BigInt(userId),
    isRead: false,
  });
  return count;
};

// ============ MARK AS READ (single) ============
// Khi user click vào 1 notification → mark đã đọc.
// Check ownership: chỉ user của noti mới được mark.
export const markAsReadService = async (notificationId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    const err = new Error("Notification not found.");
    err.status = 404;
    throw err;
  }

  const noti = await Notification.findById(notificationId);
  if (!noti) {
    const err = new Error("Notification not found.");
    err.status = 404;
    throw err;
  }
  if (noti.userId !== BigInt(userId)) {
    const err = new Error(
      "You don't have permission to access this notification.",
    );
    err.status = 403;
    throw err;
  }

  if (!noti.isRead) {
    noti.isRead = true;
    await noti.save();
  }
};

// ============ MARK ALL AS READ ============
// Khi user click "Mark all as read" → bulk update mọi noti chưa đọc.
// Return số lượng đã update để FE biết clear badge bao nhiêu.
export const markAllAsReadService = async (userId) => {
  const result = await Notification.updateMany(
    { userId: BigInt(userId), isRead: false },
    { $set: { isRead: true } },
  );
  return { modifiedCount: result.modifiedCount };
};

// ============ DELETE NOTIFICATION ============
// Hard delete (notification không cần soft delete — không có lý do giữ history).
// Check ownership trước khi xóa.
export const deleteNotificationService = async (notificationId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    const err = new Error("Notification not found.");
    err.status = 404;
    throw err;
  }

  const noti = await Notification.findById(notificationId);
  if (!noti) {
    const err = new Error("Notification not found.");
    err.status = 404;
    throw err;
  }
  if (noti.userId !== BigInt(userId)) {
    const err = new Error(
      "You don't have permission to delete this notification.",
    );
    err.status = 403;
    throw err;
  }

  await Notification.deleteOne({ _id: notificationId });
};
