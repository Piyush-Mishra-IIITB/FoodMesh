require("dotenv").config();

const express = require("express");

const connectDB = require("./config/db");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();

app.use(express.json());

app.use("/api/payments", paymentRoutes);

const PORT = process.env.PORT || 5005;

connectDB();

app.listen(PORT, () => {
  console.log(`Payment Service running on port ${PORT}`);
});
