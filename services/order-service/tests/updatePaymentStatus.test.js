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
const { redisClient } = require("../config/redis");
const { updatePaymentStatus } = require("../controllers/orderController");

describe("updatePaymentStatus", () => {
  let req;
  let res;
  let order;

  const orderId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    jest.resetAllMocks();

    order = {
      _id: orderId,
      paymentStatus: "PENDING",
      save: jest.fn().mockResolvedValue(true),
    };

    req = {
      body: {
        orderId,
        status: "PAID",
      },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    Order.findById.mockResolvedValue(order);
    redisClient.del.mockResolvedValue(1);
  });

  test("should return 400 when orderId is missing", async () => {
    req.body.orderId = undefined;

    await updatePaymentStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Order.findById).not.toHaveBeenCalled();
  });

  test("should return 400 when status is missing", async () => {
    req.body.status = undefined;

    await updatePaymentStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(Order.findById).not.toHaveBeenCalled();
  });

  test.each(["INVALID", "PENDING", "CANCELLED"])(
    "should reject invalid payment status: %s",
    async (status) => {
      req.body.status = status;

      await updatePaymentStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(Order.findById).not.toHaveBeenCalled();
    },
  );

  test("should return 404 when order does not exist", async () => {
    Order.findById.mockResolvedValue(null);

    await updatePaymentStatus(req, res);

    expect(Order.findById).toHaveBeenCalledWith(orderId);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test.each(["PAID", "FAILED", "REFUNDED"])(
    "should update payment status to %s",
    async (status) => {
      req.body.status = status;

      await updatePaymentStatus(req, res);

      expect(order.paymentStatus).toBe(status);
      expect(order.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    },
  );

  test("should invalidate order cache after updating payment status", async () => {
    await updatePaymentStatus(req, res);

    expect(redisClient.del).toHaveBeenCalled();
  });

  test("should still succeed when Redis cache invalidation fails", async () => {
    redisClient.del.mockRejectedValue(new Error("Redis error"));

    await updatePaymentStatus(req, res);

    expect(order.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("should return 500 when database lookup fails", async () => {
    Order.findById.mockRejectedValue(new Error("Database error"));

    await updatePaymentStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test("should return 500 when saving the order fails", async () => {
    order.save.mockRejectedValue(new Error("Save error"));

    await updatePaymentStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
