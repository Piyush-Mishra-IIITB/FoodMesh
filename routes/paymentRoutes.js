const express = require("express");

const {
  processOnlinePayment,
  completeCODPayment,
} = require("../controllers/paymentController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// Customer pays for ONLINE order
router.post(
  "/pay",
  authMiddleware,
  roleMiddleware("customer"),
  processOnlinePayment,
);

// Delivery partner completes COD payment
router.post(
  "/cod/complete",
  authMiddleware,
  roleMiddleware("delivery_partner"),
  completeCODPayment,
);

module.exports = router;
