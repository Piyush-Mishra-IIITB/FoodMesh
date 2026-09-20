const Order = require("../models/orderModel");
const DeliveryPartner = require("../models/deliveryPartnerModel");

// =====================================================
// PROCESS ONLINE PAYMENT
// Customer pays for ONLINE order
// =====================================================

const processOnlinePayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        message: "Order ID is required",
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // Only order owner can pay
    if (order.customer.toString() !== req.user.userId) {
      return res.status(403).json({
        message: "You are not allowed to pay for this order",
      });
    }

    // Order must use ONLINE payment
    if (order.paymentMethod !== "ONLINE") {
      return res.status(400).json({
        message: "This order uses COD payment",
      });
    }

    // Check if already paid
    if (order.paymentStatus === "PAID") {
      return res.status(400).json({
        message: "Order is already paid",
      });
    }

    // Cannot pay for cancelled order
    if (order.status === "CANCELLED") {
      return res.status(400).json({
        message: "Cannot pay for a cancelled order",
      });
    }

    // Mock payment
    order.paymentStatus = "PAID";

    await order.save();

    res.status(200).json({
      message: "Payment successful",

      paymentStatus: order.paymentStatus,

      orderId: order._id,

      amount: order.totalAmount,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// =====================================================
// COMPLETE COD PAYMENT
// Delivery partner collects cash
// =====================================================

const completeCODPayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        message: "Order ID is required",
      });
    }

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    // Order must use COD
    if (order.paymentMethod !== "COD") {
      return res.status(400).json({
        message: "This order does not use COD payment",
      });
    }

    // Order must be delivered
    if (order.status !== "DELIVERED") {
      return res.status(400).json({
        message: "COD payment can only be completed after delivery",
      });
    }

    // Check that this delivery partner
    // was assigned to the order
    const deliveryPartner = await DeliveryPartner.findOne({
      _id: order.deliveryPartner,
      user: req.user.userId,
    });

    if (!deliveryPartner) {
      return res.status(403).json({
        message: "You are not allowed to complete this payment",
      });
    }

    // Check if already paid
    if (order.paymentStatus === "PAID") {
      return res.status(400).json({
        message: "Order is already paid",
      });
    }

    // Mark COD payment as completed
    order.paymentStatus = "PAID";

    await order.save();

    res.status(200).json({
      message: "COD payment completed successfully",

      paymentStatus: order.paymentStatus,

      orderId: order._id,

      amount: order.totalAmount,
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
  processOnlinePayment,
  completeCODPayment,
};
