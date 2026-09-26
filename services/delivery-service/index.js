require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");

const connectDB = require("./config/db");
const {
  connectRabbitMQ,
  consumeOrderReadyEvents,
} = require("./config/rabbitmq");
const { connectRedis } = require("./config/redis");

const deliveryPartnerRoutes = require("./routes/deliveryPartnerRoutes");

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/api/delivery", deliveryPartnerRoutes);

const PORT = process.env.PORT || 5004;

connectDB();
connectRedis();

const startServer = async () => {
  try {
    await connectRabbitMQ();
    await consumeOrderReadyEvents();

    app.listen(PORT, () => {
      console.log(`Delivery Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start Delivery Service:", error.message);
    process.exit(1);
  }
};

startServer();
