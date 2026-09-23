const MenuItem = require("../models/menuItemModel");
const Restaurant = require("../models/restaurantModel");

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

    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    const menuItems = await MenuItem.find({
      restaurant: restaurantId,
    });

    res.status(200).json({
      count: menuItems.length,
      menuItems,
    });
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
    const menuItem = await MenuItem.findById(req.params.id);

    if (!menuItem) {
      return res.status(404).json({
        message: "Menu item not found",
      });
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
