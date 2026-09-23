const Payment = require("../models/paymentModel");
const axios = require("axios");

const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://localhost:5003";
// CREATE PAYMENT
const createPayment = async (req, res) => {
  try {
    const { order, customer, amount, paymentMethod } = req.body;

    if (!order || !customer || !amount || !paymentMethod) {
      return res.status(400).json({
        message: "Please provide all required fields",
      });
    }

    if (!["COD", "ONLINE"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "Invalid payment method",
      });
    }

    const existingPayment = await Payment.findOne({
      order,
    });

    if (existingPayment) {
      return res.status(400).json({
        message: "Payment already exists for this order",
      });
    }

    const payment = await Payment.create({
      order,
      customer,
      amount,
      paymentMethod,
      status: paymentMethod === "COD" ? "PAID" : "PAID",
      transactionId: paymentMethod === "ONLINE" ? `TXN_${Date.now()}` : null,
    });
    await axios.patch(
      `${ORDER_SERVICE_URL}/api/orders/internal/payment-status`,
      {
        orderId: order,
        status: payment.status,
      },
    );
    res.status(201).json({
      message: "Payment processed successfully",
      payment,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// GET PAYMENT BY ORDER
const getPaymentByOrder = async (req, res) => {
  try {
    const payment = await Payment.findOne({
      order: req.params.orderId,
    });

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found",
      });
    }

    res.status(200).json({
      payment,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// REFUND PAYMENT
const refundPayment = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        message: "Order ID is required",
      });
    }

    const payment = await Payment.findOne({
      order: orderId,
    });

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found",
      });
    }

    if (payment.status !== "PAID") {
      return res.status(400).json({
        message: "Payment cannot be refunded",
      });
    }

    payment.status = "REFUNDED";

    await payment.save();

    await axios.patch(
      `${ORDER_SERVICE_URL}/api/orders/internal/payment-status`,
      {
        orderId,
        status: "REFUNDED",
      },
    );

    res.status(200).json({
      message: "Payment refunded successfully",
      payment,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};
module.exports = {
  createPayment,
  getPaymentByOrder,
  refundPayment,
};
