const mongoose = require("mongoose");
const axios = require("axios");
const Order = require("../models/orderModel");
const RESTAURANT_SERVICE_URL =
  process.env.RESTAURANT_SERVICE_URL || "http://localhost:5002";

const DELIVERY_SERVICE_URL =
  process.env.DELIVERY_SERVICE_URL || "http://localhost:5004";

const PAYMENT_SERVICE_URL =
  process.env.PAYMENT_SERVICE_URL || "http://localhost:5005";

// CREATE ORDER

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

    if (!mongoose.Types.ObjectId.isValid(restaurant)) {
      return res.status(400).json({
        message: "Invalid restaurant ID",
      });
    }

    if (!["COD", "ONLINE"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "Invalid payment method",
      });
    }

    // Ask Restaurant Service to validate restaurant and menu items
    const response = await axios.post(
      `${RESTAURANT_SERVICE_URL}/api/menu/internal/validate`,
      {
        restaurantId: restaurant,
        items,
      },
    );

    // Restaurant Service returns authoritative item data and total
    const orderItems = response.data.items;
    const totalAmount = response.data.totalAmount;

    const order = await Order.create({
      customer: req.user.userId,
      restaurant,
      items: orderItems,
      deliveryAddress,
      totalAmount,
      paymentMethod,
    });

    // payment
    try {
      await axios.post(`${PAYMENT_SERVICE_URL}/api/payments`, {
        order: order._id,
        customer: req.user.userId,
        amount: totalAmount,
        paymentMethod,
      });
    } catch (err) {
      await Order.findByIdAndDelete(order._id);
      throw err;
    }
    const updatedOrder = await Order.findById(order._id);
    res.status(201).json({
      message: "Order created successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error(error);

    if (error.response) {
      return res.status(error.response.status).json({
        message:
          error.response.data.message || "Restaurant Service request failed",
      });
    }

    res.status(500).json({
      message: "Server error",
    });
  }
};
// GET MY ORDERS
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      customer: req.user.userId,
    }).sort({
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

// GET ORDER BY ID
const getOrderById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // Customer can only view their own order
    if (
      req.user.role === "customer" &&
      order.customer.toString() !== req.user.userId
    ) {
      return res.status(403).json({
        message: "You are not allowed to view this order",
      });
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

// GET RESTAURANT ORDERS

const getRestaurantOrders = async (req, res) => {
  try {
    // Get restaurant owned by the logged-in user
    const response = await axios.get(
      `${RESTAURANT_SERVICE_URL}/api/restaurants/owner/${req.user.userId}`,
    );

    const restaurantId = response.data.restaurant.id;

    // Get orders for that restaurant
    const orders = await Order.find({
      restaurant: restaurantId,
    }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      orders,
    });
  } catch (error) {
    console.error(error);

    if (error.response) {
      return res.status(error.response.status).json({
        message:
          error.response.data.message || "Restaurant Service request failed",
      });
    }

    res.status(500).json({
      message: "Server error",
    });
  }
};

// UPDATE ORDER STATUS

const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const currentStatus = order.status;

    // Restaurant owner flow
    if (req.user.role === "restaurant_owner") {
      const allowedTransitions = {
        PLACED: "CONFIRMED",
        CONFIRMED: "PREPARING",
        PREPARING: "READY",
      };

      if (allowedTransitions[currentStatus] !== status) {
        return res.status(400).json({
          message: `Invalid status transition from ${currentStatus} to ${status}`,
        });
      }

      // Online orders must be paid before confirmation
      if (
        currentStatus === "PLACED" &&
        status === "CONFIRMED" &&
        order.paymentMethod === "ONLINE" &&
        order.paymentStatus !== "PAID"
      ) {
        return res.status(400).json({
          message: "Online payment is not completed",
        });
      }
    }

    // Customer cancellation
    if (req.user.role === "customer") {
      if (currentStatus !== "PLACED" || status !== "CANCELLED") {
        return res.status(400).json({
          message: "Order cannot be cancelled at this stage",
        });
      }

      if (order.customer.toString() !== req.user.userId) {
        return res.status(403).json({
          message: "You are not allowed to update this order",
        });
      }

      if (order.paymentMethod === "ONLINE" && order.paymentStatus === "PAID") {
        await axios.patch(`${PAYMENT_SERVICE_URL}/api/payments/refund`, {
          orderId: order._id,
        });
      }

      // No delivery partner should normally exist at PLACED,
      // but release it if one was assigned.
      if (order.deliveryPartner) {
        await axios.patch(
          `${DELIVERY_SERVICE_URL}/api/delivery/internal/release`,
          {
            partnerId: order.deliveryPartner,
          },
        );

        order.deliveryPartner = null;
      }
    }

    // Delivery partner flow
    if (req.user.role === "delivery_partner") {
      const allowedTransitions = {
        READY: "PICKED_UP",
        PICKED_UP: "OUT_FOR_DELIVERY",
        OUT_FOR_DELIVERY: "DELIVERED",
      };

      if (allowedTransitions[currentStatus] !== status) {
        return res.status(400).json({
          message: `Invalid status transition from ${currentStatus} to ${status}`,
        });
      }

      if (!order.deliveryPartner) {
        return res.status(400).json({
          message: "No delivery partner assigned",
        });
      }
    }

    // Automatically assign delivery partner when order becomes READY
    if (
      req.user.role === "restaurant_owner" &&
      currentStatus === "PREPARING" &&
      status === "READY"
    ) {
      try {
        const restaurantResponse = await axios.get(
          `${RESTAURANT_SERVICE_URL}/api/restaurants/${order.restaurant}`,
        );

        const restaurant = restaurantResponse.data.restaurant;

        const latitude = restaurant.address.latitude;
        const longitude = restaurant.address.longitude;

        if (typeof latitude !== "number" || typeof longitude !== "number") {
          return res.status(400).json({
            message: "Restaurant location is not available",
          });
        }

        const partnerResponse = await axios.post(
          `${DELIVERY_SERVICE_URL}/api/delivery/internal/nearest`,
          {
            latitude,
            longitude,
          },
        );

        const partner = partnerResponse.data.partner;

        await axios.patch(
          `${DELIVERY_SERVICE_URL}/api/delivery/internal/assign`,
          {
            partnerId: partner._id,
          },
        );

        order.deliveryPartner = partner._id;
      } catch (error) {
        console.error(error);

        if (error.response) {
          return res.status(error.response.status).json({
            message:
              error.response.data.message || "Delivery Service request failed",
          });
        }

        return res.status(500).json({
          message: "Failed to assign delivery partner",
        });
      }
    }

    order.status = status;

    await order.save();

    // Delivery completed
    if (req.user.role === "delivery_partner" && status === "DELIVERED") {
      await axios.patch(
        `${DELIVERY_SERVICE_URL}/api/delivery/internal/complete`,
        {
          partnerId: order.deliveryPartner,
        },
      );
    }
    const updatedOrder = await Order.findById(order._id);
    res.status(200).json({
      message: "Order status updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    console.error(error);

    if (error.response) {
      return res.status(error.response.status).json({
        message:
          error.response.data.message || "Delivery Service request failed",
      });
    }

    res.status(500).json({
      message: "Server error",
    });
  }
};
// ASSIGN DELIVERY PARTNER

const assignDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }
    const ownerResponse = await axios.get(
      `${RESTAURANT_SERVICE_URL}/api/restaurants/owner/${req.user.userId}`,
    );

    const restaurantId = ownerResponse.data.restaurant.id;

    if (restaurantId.toString() !== order.restaurant.toString()) {
      return res.status(403).json({
        message: "You are not allowed to assign delivery for this restaurant",
      });
    }
    if (order.status !== "READY") {
      return res.status(400).json({
        message: "Delivery partner can only be assigned when order is READY",
      });
    }

    if (order.deliveryPartner) {
      return res.status(400).json({
        message: "Delivery partner already assigned",
      });
    }

    // Get restaurant details from Restaurant Service
    const restaurantResponse = await axios.get(
      `${RESTAURANT_SERVICE_URL}/api/restaurants/${order.restaurant}`,
    );

    const restaurant = restaurantResponse.data.restaurant;

    const latitude = restaurant.address.latitude;
    const longitude = restaurant.address.longitude;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return res.status(400).json({
        message: "Restaurant location is not available",
      });
    }

    // Find nearest available delivery partner
    const partnerResponse = await axios.post(
      `${DELIVERY_SERVICE_URL}/api/delivery/internal/nearest`,
      {
        latitude,
        longitude,
      },
    );

    const partner = partnerResponse.data.partner;

    // Mark partner as busy
    await axios.patch(`${DELIVERY_SERVICE_URL}/api/delivery/internal/assign`, {
      partnerId: partner._id,
    });

    try {
      order.deliveryPartner = partner._id;

      await order.save();
    } catch (error) {
      await axios.patch(
        `${DELIVERY_SERVICE_URL}/api/delivery/internal/release`,
        {
          partnerId: partner._id,
        },
      );

      throw error;
    }

    res.status(200).json({
      message: "Delivery partner assigned successfully",
      order,
      deliveryPartner: partner,
    });
  } catch (error) {
    console.error(error);

    if (error.response) {
      return res.status(error.response.status).json({
        message:
          error.response.data.message || "Delivery Service request failed",
      });
    }

    res.status(500).json({
      message: "Server error",
    });
  }
};

// GET DELIVERY ORDERS
const getDeliveryOrders = async (req, res) => {
  try {
    const response = await axios.get(
      `${DELIVERY_SERVICE_URL}/api/delivery/internal/user/${req.user.userId}`,
    );

    const deliveryPartnerId = response.data.deliveryPartner.id;

    const orders = await Order.find({
      deliveryPartner: deliveryPartnerId,
    }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      orders,
    });
  } catch (error) {
    console.error(error);

    if (error.response) {
      return res.status(error.response.status).json({
        message:
          error.response.data.message || "Delivery Service request failed",
      });
    }

    res.status(500).json({
      message: "Server error",
    });
  }
};

// UPDATE PAYMENT STATUS
// Internal endpoint for Payment Service

const updatePaymentStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    if (!orderId || !status) {
      return res.status(400).json({
        message: "Order ID and payment status are required",
      });
    }

    if (!["PAID", "FAILED", "REFUNDED"].includes(status)) {
      return res.status(400).json({
        message: "Invalid payment status",
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    order.paymentStatus = status;

    await order.save();

    res.status(200).json({
      message: "Payment status updated successfully",
      order,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// GET PAYMENT DETAILS
// Internal endpoint for Payment Service

const getPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    res.status(200).json({
      orderId: order._id,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      totalAmount: order.totalAmount,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

module.exports = {
  createOrder,
  getMyOrders,
  getOrderById,
  updateOrderStatus,
  assignDeliveryPartner,
  getDeliveryOrders,
  getRestaurantOrders,
  updatePaymentStatus,
  getPaymentStatus,
};
