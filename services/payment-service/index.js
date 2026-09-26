require("dotenv").config();
const { connectRabbitMQ, consumePaymentEvents } = require("./config/rabbitmq");
const express = require("express");

const connectDB = require("./config/db");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();

app.use(express.json());

app.use("/api/payments", paymentRoutes);

const PORT = process.env.PORT || 5005;

connectDB();

const startServer = async () => {
  try {
    await connectRabbitMQ();
    await consumePaymentEvents();

    app.listen(PORT, () => {
      console.log(`Payment Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start Payment Service:", error.message);
    process.exit(1);
  }
};

startServer();
