const express = require("express");

const {
  createDeliveryPartner,
  getDeliveryPartner,
  updateDeliveryPartner,
  updateOnlineStatus,
  updateCurrentLocation,
} = require("../controllers/deliveryController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// Create delivery partner profile
router.post(
  "/",
  authMiddleware,
  roleMiddleware("delivery_partner"),
  createDeliveryPartner,
);

// Get delivery partner
router.get("/:id", authMiddleware, getDeliveryPartner);

// Update delivery partner
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("delivery_partner", "admin"),
  updateDeliveryPartner,
);

// Update delivery partner online status
router.patch(
  "/status/online",
  authMiddleware,
  roleMiddleware("delivery_partner"),
  updateOnlineStatus,
);

// Update delivery partner current location
router.patch(
  "/location",
  authMiddleware,
  roleMiddleware("delivery_partner"),
  updateCurrentLocation,
);

module.exports = router;
