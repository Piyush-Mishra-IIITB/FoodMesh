const express = require("express");

const {
  createMenuItem,
  getRestaurantMenu,
  getMenuItem,
  updateMenuItem,
  deleteMenuItem,
  validateOrderItems,
} = require("../controllers/menuController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

// Create menu item
router.post(
  "/",
  authMiddleware,
  roleMiddleware("restaurant_owner", "admin"),
  createMenuItem,
);

// Get restaurant menu
router.get("/restaurant/:restaurantId", getRestaurantMenu);
// Internal endpoint for Order Service
router.post("/internal/validate", validateOrderItems);
// Get single menu item
router.get("/:id", getMenuItem);

// Update menu item
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("restaurant_owner", "admin"),
  updateMenuItem,
);

// Delete menu item
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("restaurant_owner", "admin"),
  deleteMenuItem,
);

module.exports = router;
