jest.mock("../models/orderModel", () => ({
  findById: jest.fn(),
}));

jest.mock("../config/redis", () => ({
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock("../config/rabbitmq", () => ({
  getChannel: jest.fn(),
}));

jest.mock("axios");

const Order = require("../models/orderModel");
const { getPaymentStatus } = require("../controllers/orderController");

describe("getPaymentStatus", () => {
  let req;
  let res;

  const orderId = "507f1f77bcf86cd799439011";

  const order = {
    _id: orderId,
    paymentStatus: "PAID",
    paymentMethod: "ONLINE",
    totalAmount: 500,
  };

  beforeEach(() => {
    jest.resetAllMocks();

    req = {
      params: { orderId },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    Order.findById.mockResolvedValue(order);
  });

  test("should return 400 for invalid order ID", async () => {
    req.params.orderId = "invalid-id";

    await getPaymentStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Order.findById).not.toHaveBeenCalled();
  });

  test("should return 404 when order does not exist", async () => {
    Order.findById.mockResolvedValue(null);

    await getPaymentStatus(req, res);

    expect(Order.findById).toHaveBeenCalledWith(orderId);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "Order not found",
    });
  });

  test("should return payment details for an existing order", async () => {
    await getPaymentStatus(req, res);

    expect(Order.findById).toHaveBeenCalledWith(orderId);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      orderId,
      paymentStatus: "PAID",
      paymentMethod: "ONLINE",
      totalAmount: 500,
    });
  });

  test("should return FAILED payment status", async () => {
    Order.findById.mockResolvedValue({
      ...order,
      paymentStatus: "FAILED",
    });

    await getPaymentStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      orderId,
      paymentStatus: "FAILED",
      paymentMethod: "ONLINE",
      totalAmount: 500,
    });
  });

  test("should return 500 when database lookup fails", async () => {
    Order.findById.mockRejectedValue(new Error("Database error"));

    await getPaymentStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Server error",
    });
  });
});
