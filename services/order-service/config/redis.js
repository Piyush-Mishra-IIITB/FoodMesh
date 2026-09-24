const { createClient } = require("redis");

const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err);
});

const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log("Redis connected");
  } catch (error) {
    console.error("Redis connection failed:", error.message);
    throw error;
  }
};

module.exports = {
  redisClient,
  connectRedis,
};
