import { createClient } from "redis";

const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
});

redisClient.on("error", (err) => console.log("Redis err:", err));

export const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log("Connected to Redis in Docker!");
  } catch (error) {
    console.log("Connected to Redis in Docker failed!", error);
    process.exit(1);
  }
};

export default redisClient;
