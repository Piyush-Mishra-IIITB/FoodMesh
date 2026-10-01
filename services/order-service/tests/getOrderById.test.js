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
const { getOrderById } = require("../controllers/orderController");

describe("getOrderById", () => {
  let req;
  let res;
  let order;

  const orderId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    jest.resetAllMocks();

    order = {
      _id: orderId,
      customer: "customer123",
      totalAmount: 500,
    };

    req = {
      params: { id: orderId },
      user: {
        userId: "customer123",
        role: "customer",
      },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    redisClient.get.mockResolvedValue(null);
    redisClient.set.mockResolvedValue("OK");
    Order.findById.mockResolvedValue(order);
  });

  test("should reject invalid order ID", async () => {
    req.params.id = "invalid-id";

    await getOrderById(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid order ID",
    });
    expect(Order.findById).not.toHaveBeenCalled();
  });

  test("should return order from Redis cache", async () => {
    redisClient.get.mockResolvedValue(JSON.stringify(order));

    await getOrderById(req, res);

    expect(redisClient.get).toHaveBeenCalledWith(`order:${orderId}`);
    expect(Order.findById).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ order });
  });

  test("should return 403 when customer does not own cached order", async () => {
    redisClient.get.mockResolvedValue(
      JSON.stringify({ ...order, customer: "anotherCustomer" }),
    );

    await getOrderById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(Order.findById).not.toHaveBeenCalled();
  });

  test("should return 404 when order does not exist", async () => {
    Order.findById.mockResolvedValue(null);

    await getOrderById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: "Order not found",
    });
  });

  test("should return 403 when customer does not own database order", async () => {
    Order.findById.mockResolvedValue({
      ...order,
      customer: "anotherCustomer",
    });

    await getOrderById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: "You are not allowed to view this order",
    });
  });

  test("should fetch from database and cache the order", async () => {
    await getOrderById(req, res);

    expect(Order.findById).toHaveBeenCalledWith(orderId);
    expect(redisClient.set).toHaveBeenCalledWith(
      `order:${orderId}`,
      JSON.stringify(order),
      { EX: 600 },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ order });
  });

  test("should continue when Redis GET fails", async () => {
    redisClient.get.mockRejectedValue(new Error("Redis error"));

    await getOrderById(req, res);

    expect(Order.findById).toHaveBeenCalledWith(orderId);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("should return order even when Redis SET fails", async () => {
    redisClient.set.mockRejectedValue(new Error("Redis error"));

    await getOrderById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ order });
  });

  test("should allow restaurant owner to view order", async () => {
    req.user.role = "restaurant_owner";

    await getOrderById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ order });
  });

  test("should return 500 when database query fails", async () => {
    Order.findById.mockRejectedValue(new Error("Database error"));

    await getOrderById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Server error",
    });
  });
});
