import express from "express";
import authRoute from "./auth.route.js";
import userRoute from "./user.route.js";
import postRoute from "./post.route.js";
import commentRoute from "./comment.route.js";
import { protectedRoute } from "../middlewares/auth.middleware.js";
import { checkBlackList } from "../middlewares/checkBlackList.middleware.js";

const rootRouter = express.Router();

// public route
rootRouter.use("/auth", authRoute);

// middleware
rootRouter.use(protectedRoute);
rootRouter.use(checkBlackList);

// private route
rootRouter.use("/users", userRoute);
rootRouter.use("/posts", postRoute);
rootRouter.use("/comments", commentRoute);

export default rootRouter;
