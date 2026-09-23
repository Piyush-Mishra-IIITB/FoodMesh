const express = require("express");

const {
  createRestaurant,
  getAllRestaurants,
  getRestaurantById,
  updateRestaurant,
  deleteRestaurant,
  getRestaurantByOwner,
} = require("../controllers/restaurantController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();
router.post(
  "/",
  authMiddleware,
  roleMiddleware("restaurant_owner"),
  createRestaurant,
);
router.get("/", getAllRestaurants);
router.get("/owner/:ownerId", getRestaurantByOwner);
router.get("/:id", getRestaurantById);
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("restaurant_owner", "admin"),
  updateRestaurant,
);

router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("restaurant_owner", "admin"),
  deleteRestaurant,
);

module.exports = router;
