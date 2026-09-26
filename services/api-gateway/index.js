const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
require("dotenv").config();

const { v4: uuidv4 } = require("uuid");
const writeLog = require("./logger");
const rateLimit = require("express-rate-limit");
const app = express();

const PORT = process.env.PORT || 5000;

const USER_SERVICE_URL = process.env.USER_SERVICE_URL;
const RESTAURANT_SERVICE_URL = process.env.RESTAURANT_SERVICE_URL;
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL;
const DELIVERY_SERVICE_URL = process.env.DELIVERY_SERVICE_URL;
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL;

// ===============================
// Request ID + Logging Middleware
// ===============================
app.use((req, res, next) => {
  const requestId = uuidv4();
  const startTime = Date.now();

  req.requestId = requestId;

  res.setHeader("X-Request-ID", requestId);

  res.on("finish", () => {
    const responseTime = Date.now() - startTime;

    const logLevel =
      res.statusCode >= 500 ? "ERROR" : res.statusCode >= 400 ? "WARN" : "INFO";

    writeLog(
      `[${logLevel}] [Gateway] ${req.method} ${req.originalUrl} | ` +
        `Status: ${res.statusCode} | ` +
        `Response Time: ${responseTime}ms | ` +
        `Request ID: ${requestId}`,
    );
  });

  next();
});
// ===============================
// Rate Limiting
// ===============================

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many requests, please try again later.",
  },
});

app.use(limiter);
// ===============================
// User Service
// ===============================

app.use(
  "/api/users",
  createProxyMiddleware({
    target: `${USER_SERVICE_URL}/api/users`,
    changeOrigin: true,
  }),
);

// ===============================
// Restaurant Service
// ===============================

app.use(
  "/api/restaurants",
  createProxyMiddleware({
    target: `${RESTAURANT_SERVICE_URL}/api/restaurants`,
    changeOrigin: true,
  }),
);

// ===============================
// Menu Service
// ===============================

// Block internal Restaurant/Menu endpoints
app.use("/api/menu/internal", (req, res) => {
  return res.status(403).json({
    message: "Internal endpoint not accessible through API Gateway",
  });
});

// Public Menu routes
app.use(
  "/api/menu",
  createProxyMiddleware({
    target: `${RESTAURANT_SERVICE_URL}/api/menu`,
    changeOrigin: true,
  }),
);

// ===============================
// Order Service
// ===============================

// Block internal Order Service endpoints
app.use("/api/orders/internal", (req, res) => {
  return res.status(403).json({
    message: "Internal endpoint not accessible through API Gateway",
  });
});

// Order Service
app.use(
  "/api/orders",
  createProxyMiddleware({
    target: `${ORDER_SERVICE_URL}/api/orders`,
    changeOrigin: true,
  }),
);

// ===============================
// Delivery Service
// ===============================

// Block internal Delivery Service endpoints
app.use("/api/delivery/internal", (req, res) => {
  return res.status(403).json({
    message: "Internal endpoint not accessible through API Gateway",
  });
});

// Delivery Service
app.use(
  "/api/delivery",
  createProxyMiddleware({
    target: `${DELIVERY_SERVICE_URL}/api/delivery`,
    changeOrigin: true,
  }),
);

// ===============================
// Payment Service
// ===============================

app.use(
  "/api/payments",
  createProxyMiddleware({
    target: `${PAYMENT_SERVICE_URL}/api/payments`,
    changeOrigin: true,
  }),
);

// ===============================
// Gateway Health Check
// ===============================

app.get("/health", (req, res) => {
  res.status(200).json({
    message: "API Gateway is running",
  });
});

// ===============================
// Start Gateway
// ===============================

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
