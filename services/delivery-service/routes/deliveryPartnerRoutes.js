const express = require("express");

const {
  createDeliveryPartner,
  getDeliveryPartnerProfile,
  updateOnlineStatus,
  updateAvailability,
  updateLocation,
  getAvailablePartners,
  findNearestPartner,
  assignDeliveryPartner,
  releaseDeliveryPartner,
  completeDelivery,
  getPartnerByUser,
} = require("../controllers/deliveryPartnerController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  roleMiddleware("delivery_partner"),
  createDeliveryPartner,
);

router.get(
  "/profile",
  authMiddleware,
  roleMiddleware("delivery_partner"),
  getDeliveryPartnerProfile,
);
router.patch(
  "/online",
  authMiddleware,
  roleMiddleware("delivery_partner"),
  updateOnlineStatus,
);
router.patch(
  "/availability",
  authMiddleware,
  roleMiddleware("delivery_partner"),
  updateAvailability,
);
router.patch(
  "/location",
  authMiddleware,
  roleMiddleware("delivery_partner"),
  updateLocation,
);
router.get("/internal/available", getAvailablePartners);
router.post("/internal/nearest", findNearestPartner);
router.patch("/internal/assign", assignDeliveryPartner);
router.patch("/internal/release", releaseDeliveryPartner);
router.patch("/internal/complete", completeDelivery);
router.get("/internal/user/:userId", getPartnerByUser);
module.exports = router;
