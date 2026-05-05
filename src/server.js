import express from "express";
import http from "http";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import connect_MongoDB from "./config/mongodb.js";
import rootRouter from "./routes/index.route.js";
import { connectRedis } from "./config/redis.js";
import { initSocket } from "./config/socket.js";
import passport from "passport";
import "./config/passport.js";
dotenv.config(); // Load environment variables from .env file

const app = express();
const PORT = 5000;

// Wrap Express app bằng http.Server để Socket.io có thể attach vào cùng server
const httpServer = http.createServer(app);

app.use(express.json());
app.use(
  cors({
    origin: true, // Cho phép mọi origin (hoặc dùng "*" nếu không dùng credentials)
    credentials: true, // BẮT BUỘC để trình duyệt chịu lưu Cookie
  }),
);
app.use(morgan("dev"));
app.use(cookieParser());
app.use(passport.initialize());

// BigInt to String
BigInt.prototype.toJSON = function () {
  return this.toString();
};

app.use("/api/v1", rootRouter);

// Init Socket.io (auth middleware + connection handler trong src/config/socket.js)
initSocket(httpServer);

async function startServer() {
  try {
    await connect_MongoDB();
    await connectRedis();
    httpServer.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.log("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
