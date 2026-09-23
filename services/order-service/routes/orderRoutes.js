const express = require("express");

const {
  createOrder,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
  assignDeliveryPartner,
  getDeliveryOrders,
  getRestaurantOrders,
  updatePaymentStatus,
  getPaymentStatus,
} = require("../controllers/orderController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// Customer creates order
router.post("/", authMiddleware, roleMiddleware("customer"), createOrder);

// Customer gets their orders
router.get("/my", authMiddleware, roleMiddleware("customer"), getMyOrders);

// Restaurant owner's orders
router.get(
  "/restaurant",
  authMiddleware,
  roleMiddleware("restaurant_owner"),
  getRestaurantOrders,
);

// Delivery partner's orders
router.get(
  "/delivery",
  authMiddleware,
  roleMiddleware("delivery_partner"),
  getDeliveryOrders,
);
router.patch("/internal/payment-status", updatePaymentStatus);
router.get("/internal/payment/:orderId", getPaymentStatus);
// Get single order
router.get("/:id", authMiddleware, getOrderById);

// Update order status
router.patch(
  "/:id/status",
  authMiddleware,
  roleMiddleware("customer", "restaurant_owner", "delivery_partner"),
  updateOrderStatus,
);

// Assign delivery partner
router.patch(
  "/:id/assign",
  authMiddleware,
  roleMiddleware("restaurant_owner", "admin"),
  assignDeliveryPartner,
);

module.exports = router;
