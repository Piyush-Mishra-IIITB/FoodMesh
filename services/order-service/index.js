require("dotenv").config();

const app = require("./app");
const startOutboxPublisher = require("./outboxPublisher");

const {
  connectRabbitMQ,
  consumeDeliveryAssignedEvents,
} = require("./config/rabbitmq");

const { connectRedis } = require("./config/redis");
const connectDB = require("./config/db");

const PORT = process.env.PORT || 5003;

connectDB();
connectRedis();

const startServer = async () => {
  try {
    await connectRabbitMQ();
    await consumeDeliveryAssignedEvents();

    startOutboxPublisher();

    app.listen(PORT, () => {
      console.log(`Order Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start Order Service:", error.message);
    process.exit(1);
  }
};

startServer();
