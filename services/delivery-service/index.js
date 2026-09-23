require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");

const connectDB = require("./config/db");
const deliveryPartnerRoutes = require("./routes/deliveryPartnerRoutes");

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/api/delivery", deliveryPartnerRoutes);

const PORT = process.env.PORT || 5004;

connectDB();

app.listen(PORT, () => {
  console.log(`Delivery Service running on port ${PORT}`);
});
