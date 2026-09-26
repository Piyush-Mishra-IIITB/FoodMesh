const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 5000;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL;

// User Service
app.use(
  "/api/users",
  createProxyMiddleware({
    target: `${USER_SERVICE_URL}/api/users`,
    changeOrigin: true,
  }),
);

// Restaurant Service
app.use(
  "/api/restaurants",
  createProxyMiddleware({
    target: `${process.env.RESTAURANT_SERVICE_URL}/api/restaurants`,
    changeOrigin: true,
  }),
);

// Menu routes
app.use(
  "/api/menu",
  createProxyMiddleware({
    target: `${process.env.RESTAURANT_SERVICE_URL}/api/menu`,
    changeOrigin: true,
  }),
);

// Order Service
app.use(
  "/api/orders",
  createProxyMiddleware({
    target: `${process.env.ORDER_SERVICE_URL}/api/orders`,
    changeOrigin: true,
  }),
);

// Delivery Service
app.use(
  "/api/delivery",
  createProxyMiddleware({
    target: `${process.env.DELIVERY_SERVICE_URL}/api/delivery`,
    changeOrigin: true,
  }),
);

// Payment Service
app.use(
  "/api/payments",
  createProxyMiddleware({
    target: `${process.env.PAYMENT_SERVICE_URL}/api/payments`,
    changeOrigin: true,
  }),
);

app.get("/health", (req, res) => {
  res.status(200).json({
    message: "API Gateway is running",
  });
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
