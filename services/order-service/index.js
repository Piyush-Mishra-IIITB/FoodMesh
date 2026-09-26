require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");

const {
  connectRabbitMQ,
  consumeDeliveryAssignedEvents,
} = require("./config/rabbitmq");
const { connectRedis } = require("./config/redis");
const connectDB = require("./config/db");
const orderRoutes = require("./routes/orderRoutes");

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/api/orders", orderRoutes);

const PORT = process.env.PORT || 5003;

connectDB();
connectRedis();

const startServer = async () => {
  try {
    await connectRabbitMQ();
    await consumeDeliveryAssignedEvents();

    app.listen(PORT, () => {
      console.log(`Order Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start Order Service:", error.message);
    process.exit(1);
  }
};

startServer();
