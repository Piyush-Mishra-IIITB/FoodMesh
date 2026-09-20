const express = require("express");

const {
  createOrder,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
  assignDeliveryPartner,
  getDeliveryOrders,
} = require("../controllers/orderController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// Customer creates order
router.post("/", authMiddleware, roleMiddleware("customer"), createOrder);

// Customer gets their orders
router.get("/my", authMiddleware, roleMiddleware("customer"), getMyOrders);

// Get single order
router.get("/:id", authMiddleware, getOrderById);

// Update order status
router.patch(
  "/:id/status",
  authMiddleware,
  roleMiddleware("customer", "restaurant_owner", "delivery_partner"),
  updateOrderStatus,
);
// Assign delivery partner to order
router.patch(
  "/:id/assign",
  authMiddleware,
  roleMiddleware("restaurant_owner", "admin"),
  assignDeliveryPartner,
);

// Get delivery partner's orders
router.get(
  "/delivery",
  authMiddleware,
  roleMiddleware("delivery_partner"),
  getDeliveryOrders,
);
module.exports = router;
