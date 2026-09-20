const Order = require("../models/orderModel");
const MenuItem = require("../models/menuItemModel");
const Restaurant = require("../models/restaurantModel");
const DeliveryPartner = require("../models/deliveryPartnerModel");
const findNearestPartner = require("../utils/findNearestPartner");

// =====================================================
// CREATE ORDER
// Customer creates an order
// =====================================================

const createOrder = async (req, res) => {
  try {
    const { restaurant, items, deliveryAddress, paymentMethod } = req.body;

    if (
      !restaurant ||
      !items ||
      items.length === 0 ||
      !deliveryAddress ||
      !paymentMethod
    ) {
      return res.status(400).json({
        message: "Please provide all required fields",
      });
    }

    // Check restaurant
    const restaurantExists = await Restaurant.findById(restaurant);

    if (!restaurantExists) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    // Check payment method
    if (!["COD", "ONLINE"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "Invalid payment method",
      });
    }

    const orderItems = [];
    let totalAmount = 0;

    // Validate menu items and calculate total
    for (const item of items) {
      if (!item.menuItem || !item.quantity) {
        return res.status(400).json({
          message: "Menu item and quantity are required",
        });
      }

      if (item.quantity < 1) {
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

      // Menu item must belong to selected restaurant
      if (menuItem.restaurant.toString() !== restaurant) {
        return res.status(400).json({
          message: "Menu item does not belong to this restaurant",
        });
      }

      // Check availability
      if (!menuItem.isAvailable) {
        return res.status(400).json({
          message: `${menuItem.name} is currently unavailable`,
        });
      }

      const itemTotal = menuItem.price * item.quantity;

      totalAmount += itemTotal;

      // Snapshot name and price
      orderItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        quantity: item.quantity,
        price: menuItem.price,
      });
    }

    // Create order
    const order = await Order.create({
      customer: req.user.userId,
      restaurant,
      items: orderItems,
      deliveryAddress,
      totalAmount,
      paymentMethod,
    });

    res.status(201).json({
      message: "Order created successfully",
      order,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// =====================================================
// GET MY ORDERS
// Customer gets their own orders
// =====================================================

const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      customer: req.user.userId,
    })
      .populate("restaurant", "name")
      .populate("deliveryPartner")
      .sort({ createdAt: -1 });

    res.status(200).json({
      orders,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// =====================================================
// GET ORDER BY ID
// =====================================================

const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("customer", "name email phone")
      .populate("restaurant", "name")
      .populate("deliveryPartner")
      .populate("items.menuItem");

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // Customer can only see their own order
    if (req.user.role === "customer") {
      if (order.customer._id.toString() !== req.user.userId) {
        return res.status(403).json({
          message: "You are not allowed to view this order",
        });
      }
    }

    // Restaurant owner can only see
    // orders belonging to their restaurant
    if (req.user.role === "restaurant_owner") {
      const restaurant = await Restaurant.findById(order.restaurant._id);

      if (!restaurant || restaurant.owner.toString() !== req.user.userId) {
        return res.status(403).json({
          message: "You are not allowed to view this order",
        });
      }
    }

    // Delivery partner can only see
    // orders assigned to them
    if (req.user.role === "delivery_partner") {
      const deliveryPartner = await DeliveryPartner.findOne({
        _id: order.deliveryPartner?._id,
        user: req.user.userId,
      });

      if (!deliveryPartner) {
        return res.status(403).json({
          message: "You are not allowed to view this order",
        });
      }
    }

    res.status(200).json({
      order,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// =====================================================
// UPDATE ORDER STATUS
// =====================================================

const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        message: "Status is required",
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const currentStatus = order.status;

    // =================================================
    // ONLINE PAYMENT CHECK
    // =================================================

    if (
      req.user.role === "restaurant_owner" &&
      currentStatus === "PLACED" &&
      status === "CONFIRMED" &&
      order.paymentMethod === "ONLINE" &&
      order.paymentStatus !== "PAID"
    ) {
      return res.status(400).json({
        message: "Online payment is pending",
      });
    }

    // =================================================
    // RESTAURANT OWNER
    // =================================================

    if (req.user.role === "restaurant_owner") {
      const restaurant = await Restaurant.findById(order.restaurant);

      if (!restaurant || restaurant.owner.toString() !== req.user.userId) {
        return res.status(403).json({
          message: "You are not allowed to update this order",
        });
      }

      const allowedTransitions = {
        PLACED: "CONFIRMED",
        CONFIRMED: "PREPARING",
        PREPARING: "READY",
      };

      if (allowedTransitions[currentStatus] !== status) {
        return res.status(400).json({
          message: `Cannot change order from ${currentStatus} to ${status}`,
        });
      }
    }

    // =================================================
    // DELIVERY PARTNER
    // =================================================

    if (req.user.role === "delivery_partner") {
      if (!order.deliveryPartner) {
        return res.status(400).json({
          message: "No delivery partner assigned",
        });
      }

      // order.deliveryPartner = DeliveryPartner._id
      // req.user.userId = User._id
      //
      // Find the delivery partner
      // belonging to the logged-in user.

      const deliveryPartner = await DeliveryPartner.findOne({
        _id: order.deliveryPartner,
        user: req.user.userId,
      });

      if (!deliveryPartner) {
        return res.status(403).json({
          message: "This order is not assigned to you",
        });
      }

      const allowedTransitions = {
        READY: "PICKED_UP",
        PICKED_UP: "OUT_FOR_DELIVERY",
        OUT_FOR_DELIVERY: "DELIVERED",
      };

      if (allowedTransitions[currentStatus] !== status) {
        return res.status(400).json({
          message: `Cannot change order from ${currentStatus} to ${status}`,
        });
      }
    }

    // =================================================
    // CUSTOMER
    // =================================================

    if (req.user.role === "customer") {
      // Customer can only modify
      // their own order
      if (order.customer.toString() !== req.user.userId) {
        return res.status(403).json({
          message: "You are not allowed to update this order",
        });
      }

      // Customer can only cancel
      // an order that is still PLACED
      if (status !== "CANCELLED") {
        return res.status(400).json({
          message: "Customer can only cancel an order",
        });
      }

      // Order can only be cancelled before
      // restaurant confirmation
      if (currentStatus !== "PLACED") {
        return res.status(400).json({
          message: "Order cannot be cancelled at this stage",
        });
      }

      // =================================================
      // ONLINE PAYMENT REFUND
      // =================================================

      if (order.paymentMethod === "ONLINE" && order.paymentStatus === "PAID") {
        // Mock refund
        order.paymentStatus = "REFUNDED";
      }

      // =================================================
      // COD CANCELLATION
      // =================================================

      // If COD and payment is still PENDING,
      // nothing needs to be changed in paymentStatus.

      order.status = "CANCELLED";

      await order.save();

      return res.status(200).json({
        message: "Order cancelled successfully",
        order,
      });
    }

    // =================================================
    // AUTOMATIC DELIVERY PARTNER ASSIGNMENT
    // PREPARING → READY
    // =================================================

    if (
      req.user.role === "restaurant_owner" &&
      currentStatus === "PREPARING" &&
      status === "READY"
    ) {
      const restaurant = await Restaurant.findById(order.restaurant);

      if (!restaurant) {
        return res.status(404).json({
          message: "Restaurant not found",
        });
      }

      const { latitude, longitude } = restaurant.address;

      if (latitude === undefined || longitude === undefined) {
        return res.status(400).json({
          message: "Restaurant location is not available",
        });
      }

      const result = await findNearestPartner(latitude, longitude);

      if (!result) {
        return res.status(404).json({
          message: "No available delivery partner found",
        });
      }

      const { partner, distance } = result;

      order.deliveryPartner = partner._id;

      // Partner is now busy
      partner.isAvailable = false;

      await partner.save();

      console.log(
        `Delivery partner ${partner._id} assigned at ${distance.toFixed(2)} km`,
      );
    }

    // =================================================
    // SAVE NEW STATUS
    // =================================================

    order.status = status;

    await order.save();

    // =================================================
    // DELIVERY COMPLETED
    // Make partner available again
    // =================================================

    if (req.user.role === "delivery_partner" && status === "DELIVERED") {
      const deliveryPartner = await DeliveryPartner.findOne({
        _id: order.deliveryPartner,
        user: req.user.userId,
      });

      if (deliveryPartner) {
        deliveryPartner.isAvailable = true;

        deliveryPartner.totalDeliveries += 1;

        await deliveryPartner.save();
      }
    }

    // =================================================
    // RESPONSE
    // =================================================

    res.status(200).json({
      message: "Order status updated successfully",
      order,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// =====================================================
// ASSIGN DELIVERY PARTNER
// Restaurant owner / Admin
// =====================================================

const assignDeliveryPartner = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    if (order.status !== "READY") {
      return res.status(400).json({
        message: "Order is not ready for delivery",
      });
    }

    const restaurant = await Restaurant.findById(order.restaurant);

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    // Check restaurant owner
    if (
      req.user.role !== "admin" &&
      restaurant.owner.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        message: "You are not allowed to assign delivery partner",
      });
    }

    // Check restaurant location
    const { latitude, longitude } = restaurant.address;

    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        message: "Restaurant location is not available",
      });
    }

    // Find nearest available partner
    const result = await findNearestPartner(latitude, longitude);

    if (!result) {
      return res.status(404).json({
        message: "No available delivery partner found",
      });
    }

    const { partner, distance } = result;

    // Assign partner
    order.deliveryPartner = partner._id;

    await order.save();

    // Partner is now busy
    partner.isAvailable = false;

    await partner.save();

    res.status(200).json({
      message: "Nearest delivery partner assigned successfully",

      deliveryPartner: {
        id: partner._id,
        user: partner.user,
        distance: `${distance.toFixed(2)} km`,
      },

      order,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// =====================================================
// GET DELIVERY PARTNER ORDERS
// =====================================================

const getDeliveryOrders = async (req, res) => {
  try {
    // Find DeliveryPartner profile
    // using logged-in User ID

    const deliveryPartner = await DeliveryPartner.findOne({
      user: req.user.userId,
    });

    if (!deliveryPartner) {
      return res.status(404).json({
        message: "Delivery partner profile not found",
      });
    }

    const orders = await Order.find({
      deliveryPartner: deliveryPartner._id,

      status: {
        $in: ["READY", "PICKED_UP", "OUT_FOR_DELIVERY"],
      },
    })
      .populate("customer", "name phone")
      .populate("restaurant", "name phone address")
      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      orders,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// =====================================================
// GET RESTAURANT ORDERS
// Restaurant owner gets orders for their restaurant
// =====================================================

const getRestaurantOrders = async (req, res) => {
  try {
    // Find restaurant owned by logged-in user
    const restaurant = await Restaurant.findOne({
      owner: req.user.userId,
    });

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurant not found",
      });
    }

    const orders = await Order.find({
      restaurant: restaurant._id,
    })
      .populate("customer", "name phone")
      .populate("deliveryPartner")
      .populate("items.menuItem")
      .sort({
        createdAt: -1,
      });

    res.status(200).json({
      orders,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// =====================================================
// EXPORT
// =====================================================

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
  assignDeliveryPartner,
  getDeliveryOrders,
  getRestaurantOrders,
};
