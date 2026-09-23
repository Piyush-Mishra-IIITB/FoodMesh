const express = require("express");

const {
  createPayment,
  getPaymentByOrder,
  refundPayment,
} = require("../controllers/paymentController");

const router = express.Router();

router.post("/", createPayment);

router.get("/order/:orderId", getPaymentByOrder);

router.patch("/refund", refundPayment);
module.exports = router;
