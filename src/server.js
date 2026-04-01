import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import connect_MongoDB from "./config/mongodb.js";
import rootRouter from "./routes/index.route.js";
import { connectRedis } from "./config/redis.js";
import passport from "passport";
import "./src/config/passport.js";
dotenv.config(); // Load environment variables from .env file

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(cors());
app.use(morgan("dev"));
app.use(cookieParser());
app.use(passport.initialize());

// BigInt to String
BigInt.prototype.toJSON = function () {
  return this.toString();
};

app.use("/api/v1", rootRouter);

async function startServer() {
  try {
    await connect_MongoDB();
    await connectRedis();
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.log("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
