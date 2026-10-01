jest.mock("../models/orderModel", () => ({
  find: jest.fn(),
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
const { getMyOrders } = require("../controllers/orderController");

describe("getMyOrders", () => {
  let req;
  let res;
  let orders;

  beforeEach(() => {
    jest.resetAllMocks();

    orders = [
      { _id: "order1", totalAmount: 500 },
      { _id: "order2", totalAmount: 300 },
    ];

    req = {
      user: { userId: "customer123" },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    redisClient.get.mockResolvedValue(null);
    redisClient.set.mockResolvedValue("OK");

    Order.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue(orders),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("should return cached orders when Redis has data", async () => {
    redisClient.get.mockResolvedValue(JSON.stringify(orders));

    await getMyOrders(req, res);

    expect(redisClient.get).toHaveBeenCalledWith("orders:customer:customer123");
    expect(Order.find).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ orders });
  });

  test("should fetch orders from MongoDB when cache is empty", async () => {
    await getMyOrders(req, res);

    expect(Order.find).toHaveBeenCalledWith({
      customer: "customer123",
    });
    expect(redisClient.set).toHaveBeenCalledWith(
      "orders:customer:customer123",
      JSON.stringify(orders),
      { EX: 600 },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ orders });
  });

  test("should continue when Redis GET fails", async () => {
    redisClient.get.mockRejectedValue(new Error("Redis GET failed"));

    await getMyOrders(req, res);

    expect(Order.find).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ orders });
  });

  test("should return orders even when Redis SET fails", async () => {
    redisClient.set.mockRejectedValue(new Error("Redis SET failed"));

    await getMyOrders(req, res);

    expect(Order.find).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ orders });
  });

  test("should return 500 when MongoDB query fails", async () => {
    Order.find.mockImplementation(() => {
      throw new Error("Database error");
    });

    await getMyOrders(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Server error",
    });
  });
});
