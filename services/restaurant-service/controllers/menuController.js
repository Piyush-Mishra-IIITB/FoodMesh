const MenuItem = require("../models/menuItemModel");
const Restaurant = require("../models/restaurantModel");
const { redisClient } = require("../config/redis");

// Create menu item
const createMenuItem = async (req, res) => {
  try {
    const {
      restaurantId,
      name,
      description,
      price,
      category,
      isVegetarian,
      image,
    } = req.body;

    if (!restaurantId || !name || price === undefined || !category) {
      return res.status(400).json({
        message: "Please provide all required fields",
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    // Only restaurant owner or admin can add menu items
    if (
      req.user.role !== "admin" &&
      restaurant.owner.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        message: "You are not allowed to modify this restaurant",
      });
    }

    const menuItem = await MenuItem.create({
      restaurant: restaurantId,
      name,
      description,
      price,
      category,
      isVegetarian,
      image,
    });
    try {
      await redisClient.del(`menu:restaurant:${restaurantId}`);
    } catch (redisError) {
      console.error("Redis DELETE failed:", redisError.message);
    }
    res.status(201).json({
      message: "Menu item created successfully",
      menuItem,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// Get all menu items of a restaurant
const getRestaurantMenu = async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const cacheKey = `menu:restaurant:${restaurantId}`;

    // Try Redis
    try {
      const cachedMenu = await redisClient.get(cacheKey);

      if (cachedMenu) {
        console.log("Redis Cache HIT");

        return res.status(200).json(JSON.parse(cachedMenu));
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

    const menuItems = await MenuItem.find({
      restaurant: restaurantId,
    });

    const response = {
      count: menuItems.length,
      menuItems,
    };

    // Try to cache the result
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
// Get single menu item
const getMenuItem = async (req, res) => {
  try {
    const menuItemId = req.params.id;
    const cacheKey = `menu:item:${menuItemId}`;

    // Try Redis
    try {
      const cachedMenuItem = await redisClient.get(cacheKey);

      if (cachedMenuItem) {
        console.log("Redis Cache HIT");

        return res.status(200).json({
          menuItem: JSON.parse(cachedMenuItem),
        });
      }

      console.log("Redis Cache MISS");
    } catch (redisError) {
      console.error("Redis GET failed:", redisError.message);
    }

    // MongoDB remains the source of truth
    const menuItem = await MenuItem.findById(menuItemId);

    if (!menuItem) {
      return res.status(404).json({
        message: "Menu item not found",
      });
    }

    // Try to cache the result
    try {
      await redisClient.set(cacheKey, JSON.stringify(menuItem), {
        EX: 600,
      });
    } catch (redisError) {
      console.error("Redis SET failed:", redisError.message);
    }

    res.status(200).json({
      menuItem,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
// Update menu item
const updateMenuItem = async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);

    if (!menuItem) {
      return res.status(404).json({
        message: "Menu item not found",
      });
    }

    const restaurant = await Restaurant.findById(menuItem.restaurant);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    if (
      req.user.role !== "admin" &&
      restaurant.owner.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        message: "You are not allowed to modify this menu item",
      });
    }

    const {
      name,
      description,
      price,
      category,
      isVegetarian,
      isAvailable,
      image,
    } = req.body;

    menuItem.name = name ?? menuItem.name;
    menuItem.description = description ?? menuItem.description;
    menuItem.price = price ?? menuItem.price;
    menuItem.category = category ?? menuItem.category;
    menuItem.isVegetarian = isVegetarian ?? menuItem.isVegetarian;
    menuItem.isAvailable = isAvailable ?? menuItem.isAvailable;
    menuItem.image = image ?? menuItem.image;

    await menuItem.save();
    try {
      await redisClient.del(`menu:item:${req.params.id}`);
      await redisClient.del(`menu:restaurant:${menuItem.restaurant}`);
    } catch (redisError) {
      console.error("Redis DELETE failed:", redisError.message);
    }
    res.status(200).json({
      message: "Menu item updated successfully",
      menuItem,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// Delete menu item
const deleteMenuItem = async (req, res) => {
  try {
    const menuItem = await MenuItem.findById(req.params.id);

    if (!menuItem) {
      return res.status(404).json({
        message: "Menu item not found",
      });
    }

    const restaurant = await Restaurant.findById(menuItem.restaurant);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    if (
      req.user.role !== "admin" &&
      restaurant.owner.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        message: "You are not allowed to delete this menu item",
      });
    }

    await MenuItem.findByIdAndDelete(req.params.id);

    try {
      await redisClient.del(`menu:item:${req.params.id}`);
      await redisClient.del(`menu:restaurant:${menuItem.restaurant}`);
    } catch (redisError) {
      console.error("Redis DELETE failed:", redisError.message);
    }
    res.status(200).json({
      message: "Menu item deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
// Internal endpoint for Order Service
const validateOrderItems = async (req, res) => {
  try {
    const { restaurantId, items } = req.body;

    if (!restaurantId || !items || items.length === 0) {
      return res.status(400).json({
        message: "Restaurant ID and items are required",
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    const validatedItems = [];
    let totalAmount = 0;

    for (const item of items) {
      if (!item.menuItem || !item.quantity) {
        return res.status(400).json({
          message: "Menu item and quantity are required",
        });
      }

      if (item.quantity <= 0) {
        return res.status(400).json({
          message: "Invalid quantity",
        });
      }

      const menuItem = await MenuItem.findById(item.menuItem);

      if (!menuItem) {
        return res.status(404).json({
          message: `Menu item ${item.menuItem} not found`,
        });
      }

      if (menuItem.restaurant.toString() !== restaurantId) {
        return res.status(400).json({
          message: "Menu item does not belong to this restaurant",
        });
      }

      if (!menuItem.isAvailable) {
        return res.status(400).json({
          message: `${menuItem.name} is currently unavailable`,
        });
      }

      const itemTotal = menuItem.price * item.quantity;

      totalAmount += itemTotal;

      validatedItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        quantity: item.quantity,
        price: menuItem.price,
      });
    }

    res.status(200).json({
      restaurant: {
        id: restaurant._id,
        name: restaurant.name,
      },
      items: validatedItems,
      totalAmount,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
module.exports = {
  createMenuItem,
  getRestaurantMenu,
  getMenuItem,
  updateMenuItem,
  deleteMenuItem,
  validateOrderItems,
};
