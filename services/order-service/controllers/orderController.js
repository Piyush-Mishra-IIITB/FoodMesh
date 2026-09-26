const mongoose = require("mongoose");
const axios = require("axios");
const Order = require("../models/orderModel");
const { getChannel } = require("../config/rabbitmq");
const { redisClient } = require("../config/redis");
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

    // =========================================
    // Publish order.created event
    // =========================================

    const channel = getChannel();

    channel.publish(
      "food_delivery_events",
      "order.created",
      Buffer.from(
        JSON.stringify({
          orderId: order._id,
          customer: order.customer,
          restaurant: order.restaurant,
          amount: order.totalAmount,
          paymentMethod: order.paymentMethod,
        }),
      ),
    );

    // Wait for RabbitMQ publisher confirmation
    await channel.waitForConfirms();

    console.log("OrderCreated event confirmed by RabbitMQ");

    const updatedOrder = await Order.findById(order._id);

    // =========================================
    // Invalidate Redis caches
    // =========================================

    try {
      const keysToDelete = [
        `orders:customer:${order.customer}`,
        `orders:restaurant:${order.restaurant}`,
      ];

      await redisClient.del(keysToDelete);

      console.log("Order creation Redis caches invalidated");
    } catch (redisError) {
      console.error("Redis cache invalidation failed:", redisError.message);
    }

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
    const customerId = req.user.userId;
    const cacheKey = `orders:customer:${customerId}`;

    // Check Redis cache
    try {
      const cachedOrders = await redisClient.get(cacheKey);

      if (cachedOrders) {
        console.log("Orders fetched from Redis");

        return res.status(200).json({
          orders: JSON.parse(cachedOrders),
        });
      }
    } catch (redisError) {
      console.error("Redis GET failed:", redisError.message);
    }

    // Cache miss -> fetch from MongoDB
    const orders = await Order.find({
      customer: customerId,
    }).sort({
      createdAt: -1,
    });

    // Store result in Redis
    try {
      await redisClient.set(cacheKey, JSON.stringify(orders), {
        EX: 600,
      });

      console.log("Orders cached in Redis");
    } catch (redisError) {
      console.error("Redis SET failed:", redisError.message);
    }

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
    const orderId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        message: "Invalid order ID",
      });
    }

    const cacheKey = `order:${orderId}`;

    // Check Redis cache
    try {
      const cachedOrder = await redisClient.get(cacheKey);

      if (cachedOrder) {
        const order = JSON.parse(cachedOrder);

        // Customer can only view their own order
        if (
          req.user.role === "customer" &&
          order.customer.toString() !== req.user.userId
        ) {
          return res.status(403).json({
            message: "You are not allowed to view this order",
          });
        }

        console.log("Order fetched from Redis");

        return res.status(200).json({
          order,
        });
      }
    } catch (redisError) {
      console.error("Redis GET failed:", redisError.message);
    }

    // Cache miss -> fetch from MongoDB
    const order = await Order.findById(orderId);

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

    // Store in Redis
    try {
      await redisClient.set(cacheKey, JSON.stringify(order), {
        EX: 600,
      });

      console.log("Order cached in Redis");
    } catch (redisError) {
      console.error("Redis SET failed:", redisError.message);
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

// GET RESTAURANT ORDERS

const getRestaurantOrders = async (req, res) => {
  try {
    // Get restaurant owned by the logged-in user
    const response = await axios.get(
      `${RESTAURANT_SERVICE_URL}/api/restaurants/owner/${req.user.userId}`,
    );

    const restaurantId = response.data.restaurant.id;

    const cacheKey = `orders:restaurant:${restaurantId}`;

    // Check Redis cache
    try {
      const cachedOrders = await redisClient.get(cacheKey);

      if (cachedOrders) {
        console.log("Restaurant orders fetched from Redis");

        return res.status(200).json({
          orders: JSON.parse(cachedOrders),
        });
      }
    } catch (redisError) {
      console.error("Redis GET failed:", redisError.message);
    }

    // Cache miss -> fetch from MongoDB
    const orders = await Order.find({
      restaurant: restaurantId,
    }).sort({
      createdAt: -1,
    });

    // Store in Redis
    try {
      await redisClient.set(cacheKey, JSON.stringify(orders), {
        EX: 600,
      });

      console.log("Restaurant orders cached in Redis");
    } catch (redisError) {
      console.error("Redis SET failed:", redisError.message);
    }

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

    const previousDeliveryPartner = order.deliveryPartner;
    const currentStatus = order.status;

    // =========================================
    // Restaurant owner flow
    // =========================================

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

    // =========================================
    // Customer cancellation
    // =========================================

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

    // =========================================
    // Delivery partner flow
    // =========================================

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

    // =========================================
    // Publish order.ready event
    // =========================================

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

        // =========================================
        // Publish order.ready event
        // =========================================

        const channel = getChannel();

        channel.publish(
          "food_delivery_events",
          "order.ready",
          Buffer.from(
            JSON.stringify({
              orderId: order._id,
              restaurantId: order.restaurant,
              latitude,
              longitude,
            }),
          ),
        );

        // Wait for RabbitMQ publisher confirmation
        await channel.waitForConfirms();

        console.log("OrderReady event confirmed by RabbitMQ");
      } catch (error) {
        console.error("Failed to publish order.ready event:", error.message);

        return res.status(500).json({
          message:
            "Order status was not updated because order.ready event could not be confirmed by RabbitMQ",
        });
      }
    }

    // =========================================
    // Update order status
    // =========================================

    order.status = status;

    await order.save();

    // =========================================
    // Invalidate Redis caches
    // =========================================

    try {
      const keysToDelete = [
        `order:${order._id}`,
        `orders:customer:${order.customer}`,
        `orders:restaurant:${order.restaurant}`,
      ];

      // Invalidate current delivery partner cache
      if (order.deliveryPartner) {
        keysToDelete.push(`orders:delivery:${order.deliveryPartner}`);
      }

      // Invalidate previous delivery partner cache
      if (
        previousDeliveryPartner &&
        (!order.deliveryPartner ||
          previousDeliveryPartner.toString() !==
            order.deliveryPartner.toString())
      ) {
        keysToDelete.push(`orders:delivery:${previousDeliveryPartner}`);
      }

      await redisClient.del(keysToDelete);

      console.log("Order Redis caches invalidated");
    } catch (redisError) {
      console.error("Redis cache invalidation failed:", redisError.message);
    }

    // =========================================
    // Delivery completed
    // =========================================

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
      // Invalidate Redis caches
      try {
        const keysToDelete = [
          `order:${order._id}`,
          `orders:customer:${order.customer}`,
          `orders:restaurant:${order.restaurant}`,
          `orders:delivery:${partner._id}`,
        ];

        await redisClient.del(keysToDelete);

        console.log("Delivery assignment Redis caches invalidated");
      } catch (redisError) {
        console.error("Redis cache invalidation failed:", redisError.message);
      }
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

    const cacheKey = `orders:delivery:${deliveryPartnerId}`;

    // Check Redis cache
    try {
      const cachedOrders = await redisClient.get(cacheKey);

      if (cachedOrders) {
        console.log("Delivery orders fetched from Redis");

        return res.status(200).json({
          orders: JSON.parse(cachedOrders),
        });
      }
    } catch (redisError) {
      console.error("Redis GET failed:", redisError.message);
    }

    // Cache miss -> fetch from MongoDB
    const orders = await Order.find({
      deliveryPartner: deliveryPartnerId,
    }).sort({
      createdAt: -1,
    });

    // Store in Redis
    try {
      await redisClient.set(cacheKey, JSON.stringify(orders), {
        EX: 600,
      });

      console.log("Delivery orders cached in Redis");
    } catch (redisError) {
      console.error("Redis SET failed:", redisError.message);
    }

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

    // Invalidate Redis caches
    try {
      const keysToDelete = [
        `order:${order._id}`,
        `orders:customer:${order.customer}`,
        `orders:restaurant:${order.restaurant}`,
      ];

      if (order.deliveryPartner) {
        keysToDelete.push(`orders:delivery:${order.deliveryPartner}`);
      }

      await redisClient.del(keysToDelete);

      console.log("Payment-related Redis caches invalidated");
    } catch (redisError) {
      console.error("Redis cache invalidation failed:", redisError.message);
    }

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
