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
const axios = require("axios");
const { getDeliveryOrders } = require("../controllers/orderController");

describe("getDeliveryOrders", () => {
  let req;
  let res;
  let orders;

  const userId = "deliveryUser123";
  const deliveryPartnerId = "partner123";

  beforeEach(() => {
    jest.resetAllMocks();

    orders = [
      { _id: "order1", totalAmount: 500 },
      { _id: "order2", totalAmount: 700 },
    ];

    req = {
      user: {
        userId,
        role: "delivery_partner",
      },
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    axios.get.mockResolvedValue({
      data: {
        deliveryPartner: { id: deliveryPartnerId },
      },
    });

    redisClient.get.mockResolvedValue(null);
    redisClient.set.mockResolvedValue("OK");

    Order.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue(orders),
    });
  });

  test("should return orders from Redis cache", async () => {
    redisClient.get.mockResolvedValue(JSON.stringify(orders));

    await getDeliveryOrders(req, res);

    expect(axios.get).toHaveBeenCalledWith(
      `http://localhost:5004/api/delivery/internal/user/${userId}`,
    );
    expect(redisClient.get).toHaveBeenCalledWith(
      `orders:delivery:${deliveryPartnerId}`,
    );
    expect(Order.find).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ orders });
  });

  test("should fetch orders from database on cache miss", async () => {
    await getDeliveryOrders(req, res);

    expect(Order.find).toHaveBeenCalledWith({
      deliveryPartner: deliveryPartnerId,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ orders });
  });

  test("should cache database results for 600 seconds", async () => {
    await getDeliveryOrders(req, res);

    expect(redisClient.set).toHaveBeenCalledWith(
      `orders:delivery:${deliveryPartnerId}`,
      JSON.stringify(orders),
      { EX: 600 },
    );
  });

  test("should continue when Redis GET fails", async () => {
    redisClient.get.mockRejectedValue(new Error("Redis error"));

    await getDeliveryOrders(req, res);

    expect(Order.find).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("should return orders even when Redis SET fails", async () => {
    redisClient.set.mockRejectedValue(new Error("Redis error"));

    await getDeliveryOrders(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ orders });
  });

  test("should return upstream error status when Delivery Service fails", async () => {
    axios.get.mockRejectedValue({
      response: {
        status: 503,
        data: { message: "Delivery Service unavailable" },
      },
    });

    await getDeliveryOrders(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      message: "Delivery Service unavailable",
    });
    expect(Order.find).not.toHaveBeenCalled();
  });

  test("should return 500 when Delivery Service fails without response", async () => {
    axios.get.mockRejectedValue(new Error("Network error"));

    await getDeliveryOrders(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Server error",
    });
  });

  test("should return 500 when database query fails", async () => {
    Order.find.mockImplementation(() => ({
      sort: jest.fn().mockRejectedValue(new Error("Database error")),
    }));

    await getDeliveryOrders(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Server error",
    });
  });
});
