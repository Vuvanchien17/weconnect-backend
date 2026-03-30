import redisClient from "../config/redis.js";

export const checkBlackList = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return next();
    }

    const token = authHeader.split(" ")[1];

    // check blacklist in redis
    const isBlacklisted = await redisClient.get(`blacklist:${token}`);

    if (isBlacklisted) {
      return res.status(401).json({
        message: "Token not exists.",
      });
    }

    next();
  } catch (error) {
    console.error("Redis check Error:", error);
    next();
  }
};
