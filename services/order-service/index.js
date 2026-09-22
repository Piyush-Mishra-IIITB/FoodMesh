require("dotenv").config();

const express = require("express");
const cookieParser = require("cookie-parser");

const connectDB = require("./config/db");
const orderRoutes = require("./routes/orderRoutes");

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/api/orders", orderRoutes);

const PORT = process.env.PORT || 5003;

connectDB();

app.listen(PORT, () => {
  console.log(`Order Service running on port ${PORT}`);
});
