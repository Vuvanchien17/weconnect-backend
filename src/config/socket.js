import { Server } from "socket.io";
import jwt from "jsonwebtoken";

// Singleton io instance — set khi initSocket() được gọi từ server.js
let io = null;

// ============ INIT (gọi 1 lần ở server.js sau khi httpServer ready) ============
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: true, // production: thay bằng FE domain cụ thể
      credentials: true,
    },
  });

  // ----- Auth middleware: verify JWT từ handshake.auth.token -----
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("UNAUTHORIZED: No token provided."));
    }

    jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
      if (err) {
        return next(new Error("UNAUTHORIZED: Invalid token."));
      }
      // Attach userId vào socket để dùng trong các handler
      socket.userId = String(decoded.userId);
      next();
    });
  });

  // ----- Connection handler -----
  io.on("connection", (socket) => {
    const userId = socket.userId;
    // Mỗi user có 1 room riêng — emit notification target user qua room này.
    // 1 user có thể mở nhiều tab/device → tất cả socket cùng userId join chung room
    // → emit 1 lần broadcast tới mọi tab/device đang online.
    socket.join(`user:${userId}`);

    console.log(`Socket connected: user ${userId} (socket id: ${socket.id})`);

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: user ${userId}`);
    });
  });

  return io;
};

// ============ EMIT HELPER (gọi từ service) ============
// Emit event tới room của 1 user cụ thể.
// Nếu user offline (không có socket nào trong room), emit silently không lỗi.
// Notification service dùng best-effort: emit fail không rollback action chính.
export const emitToUser = (userId, event, data) => {
  if (!io) {
    console.warn("[Socket.io] Not initialized — skip emit:", event);
    return;
  }
  try {
    io.to(`user:${userId.toString()}`).emit(event, data);
  } catch (err) {
    console.error("[Socket.io] Emit error:", err.message);
  }
};

// Optional: getter cho test / advanced use case
export const getIO = () => io;
