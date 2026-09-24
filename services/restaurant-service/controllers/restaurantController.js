const Restaurant = require("../models/restaurantModel");
const { redisClient } = require("../config/redis");

const createRestaurant = async (req, res) => {
  try {
    const { name, description, phone, address, cuisine } = req.body;

    if (
      !name ||
      !phone ||
      !address ||
      !address.street ||
      !address.city ||
      !address.state ||
      !address.pincode ||
      !cuisine
    ) {
      return res.status(400).json({
        message: "Please provide all required fields",
      });
    }

    const restaurant = await Restaurant.create({
      name,
      owner: req.user.userId,
      description,
      phone,
      address,
      cuisine,
    });
    try {
      await redisClient.del("restaurants:all");
    } catch (redisError) {
      console.error("Redis DELETE failed:", redisError.message);
    }
    res.status(201).json({
      message: "Restaurant created successfully",
      restaurant,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
const getAllRestaurants = async (req, res) => {
  try {
    const cacheKey = "restaurants:all";

    // Try Redis
    try {
      const cachedRestaurants = await redisClient.get(cacheKey);

      if (cachedRestaurants) {
        console.log("Redis Cache HIT");

        return res.status(200).json(JSON.parse(cachedRestaurants));
      }

      console.log("Redis Cache MISS");
    } catch (redisError) {
      console.error("Redis GET failed:", redisError.message);
    }

    // MongoDB remains the source of truth
    const restaurants = await Restaurant.find();

    const response = {
      count: restaurants.length,
      restaurants,
    };

    // Try to cache
    try {
      await redisClient.set(cacheKey, JSON.stringify(response), {
        EX: 600,
      });
    } catch (redisError) {
      console.error("Redis SET failed:", redisError.message);
    }

    res.status(200).json(response);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

const getRestaurantById = async (req, res) => {
  try {
    const restaurantId = req.params.id;
    const cacheKey = `restaurant:${restaurantId}`;

    // Try Redis
    try {
      const cachedRestaurant = await redisClient.get(cacheKey);

      if (cachedRestaurant) {
        console.log("Redis Cache HIT");

        return res.status(200).json({
          restaurant: JSON.parse(cachedRestaurant),
        });
      }

      console.log("Redis Cache MISS");
    } catch (redisError) {
      console.error("Redis GET failed:", redisError.message);
    }

    // MongoDB remains the source of truth
    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    // Try to cache
    try {
      await redisClient.set(cacheKey, JSON.stringify(restaurant), {
        EX: 600,
      });
    } catch (redisError) {
      console.error("Redis SET failed:", redisError.message);
    }

    res.status(200).json({
      restaurant,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

const updateRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    // Owner can update only their own restaurant
    if (
      req.user.role !== "admin" &&
      restaurant.owner.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        message: "You are not allowed to update this restaurant",
      });
    }

    const { name, description, phone, address, cuisine, isOpen } = req.body;

    restaurant.name = name ?? restaurant.name;
    restaurant.description = description ?? restaurant.description;
    restaurant.phone = phone ?? restaurant.phone;
    restaurant.address = address ?? restaurant.address;
    restaurant.cuisine = cuisine ?? restaurant.cuisine;
    restaurant.isOpen = isOpen ?? restaurant.isOpen;

    await restaurant.save();
    try {
      await redisClient.del("restaurants:all");
      await redisClient.del(`restaurant:${req.params.id}`);
    } catch (redisError) {
      console.error("Redis DELETE failed:", redisError.message);
    }

    res.status(200).json({
      message: "Restaurant updated successfully",
      restaurant,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

const deleteRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    // Owner can delete only their own restaurant
    if (
      req.user.role !== "admin" &&
      restaurant.owner.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        message: "You are not allowed to delete this restaurant",
      });
    }

    try {
      await redisClient.del("restaurants:all");
      await redisClient.del(`restaurant:${req.params.id}`);
    } catch (redisError) {
      console.error("Redis DELETE failed:", redisError.message);
    }

    res.status(200).json({
      message: "Restaurant deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
// Internal endpoint for Order Service
const getRestaurantByOwner = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({
      owner: req.params.ownerId,
    });

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    res.status(200).json({
      restaurant: {
        id: restaurant._id,
        name: restaurant.name,
        owner: restaurant.owner,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
module.exports = {
  createRestaurant,
  getAllRestaurants,
  getRestaurantById,
  updateRestaurant,
  deleteRestaurant,
  getRestaurantByOwner,
};
