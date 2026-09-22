require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");

const connectDB = require("./config/db");

const restaurantRoutes = require("./routes/restaurantRoutes");
const menuRoutes = require("./routes/menuRoutes");

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/api/restaurants", restaurantRoutes);
app.use("/api/menu", menuRoutes);

const PORT = process.env.PORT || 5002;

connectDB();

app.listen(PORT, () => {
  console.log(`Restaurant Service running on port ${PORT}`);
});
