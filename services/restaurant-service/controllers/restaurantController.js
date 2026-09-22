const Restaurant = require("../models/restaurantModel");

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
    const restaurants = await Restaurant.find();

    res.status(200).json({
      count: restaurants.length,
      restaurants,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

const getRestaurantById = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
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

    await Restaurant.findByIdAndDelete(req.params.id);

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
module.exports = {
  createRestaurant,
  getAllRestaurants,
  getRestaurantById,
  updateRestaurant,
  deleteRestaurant,
};
