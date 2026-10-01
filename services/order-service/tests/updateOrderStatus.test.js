jest.mock("axios", () => ({
  get: jest.fn(),
  patch: jest.fn(),
}));

jest.mock("../models/orderModel", () => ({
  findById: jest.fn(),
}));

jest.mock("../models/outboxEventModel", () => ({
  create: jest.fn(),
}));

jest.mock("../config/rabbitmq", () => ({
  getChannel: jest.fn(),
}));

jest.mock("../config/redis", () => ({
  redisClient: {
    del: jest.fn(),
  },
}));

const axios = require("axios");
const Order = require("../models/orderModel");
const { getChannel } = require("../config/rabbitmq");
const { redisClient } = require("../config/redis");

const { updateOrderStatus } = require("../controllers/orderController");

const orderId = "507f1f77bcf86cd799439011";
const customerId = "507f1f77bcf86cd799439012";
const restaurantId = "507f1f77bcf86cd799439013";
const deliveryPartnerId = "507f1f77bcf86cd799439014";

const createOrder = (overrides = {}) => ({
  _id: orderId,
  customer: customerId,
  restaurant: restaurantId,
  deliveryPartner: null,
  status: "PLACED",
  paymentMethod: "COD",
  paymentStatus: "PENDING",
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const createResponse = () => {
  const res = {};

  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);

  return res;
};

describe("Update Order Status Controller Tests", () => {
  let req;
  let res;
  let order;
  let updatedOrder;
  let channel;
  let findByIdCalls;

  const configureOrderMock = () => {
    findByIdCalls = 0;

    Order.findById.mockImplementation(async () => {
      findByIdCalls++;

      if (findByIdCalls === 1) {
        return order;
      }

      return updatedOrder;
    });
  };

  const setOrder = (overrides = {}) => {
    order = createOrder(overrides);
    updatedOrder = { ...order };

    configureOrderMock();
  };

  const setRequest = (status, role, userId = customerId) => {
    req.body.status = status;
    req.user = {
      userId,
      role,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();

    order = createOrder();
    updatedOrder = { ...order };

    req = {
      params: {
        id: orderId,
      },
      body: {
        status: "CONFIRMED",
      },
      user: {
        userId: customerId,
        role: "restaurant_owner",
      },
    };

    res = createResponse();

    configureOrderMock();

    redisClient.del.mockResolvedValue(3);

    axios.get.mockResolvedValue({
      data: {
        restaurant: {
          address: {
            latitude: 23.2599,
            longitude: 77.4126,
          },
        },
      },
    });

    axios.patch.mockResolvedValue({
      data: {
        message: "Success",
      },
    });

    channel = {
      publish: jest.fn(),
      waitForConfirms: jest.fn().mockResolvedValue(true),
    };

    getChannel.mockReturnValue(channel);

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 1. Order not found
  test("should return 404 when order does not exist", async () => {
    Order.findById.mockResolvedValueOnce(null);

    await updateOrderStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  // 2. Restaurant owner confirms COD order
  test("should allow restaurant owner to confirm a placed COD order", async () => {
    setOrder({
      status: "PLACED",
      paymentMethod: "COD",
    });

    setRequest("CONFIRMED", "restaurant_owner");

    await updateOrderStatus(req, res);

    expect(order.status).toBe("CONFIRMED");
    expect(order.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // 3. Invalid restaurant transition
  test("should reject an invalid restaurant status transition", async () => {
    setOrder({
      status: "PLACED",
    });

    setRequest("DELIVERED", "restaurant_owner");

    await updateOrderStatus(req, res);

    expect(order.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // 4. Online payment not completed
  test("should reject confirmation when online payment is not completed", async () => {
    setOrder({
      status: "PLACED",
      paymentMethod: "ONLINE",
      paymentStatus: "PENDING",
    });

    setRequest("CONFIRMED", "restaurant_owner");

    await updateOrderStatus(req, res);

    expect(order.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "Online payment is not completed",
    });
  });

  // 5. Online payment completed
  test("should allow confirmation when online payment is PAID", async () => {
    setOrder({
      status: "PLACED",
      paymentMethod: "ONLINE",
      paymentStatus: "PAID",
    });

    setRequest("CONFIRMED", "restaurant_owner");

    await updateOrderStatus(req, res);

    expect(order.status).toBe("CONFIRMED");
    expect(order.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // 6. Customer cannot cancel after PLACED
  test("should reject customer cancellation when order is not PLACED", async () => {
    setOrder({
      status: "CONFIRMED",
    });

    setRequest("CANCELLED", "customer");

    await updateOrderStatus(req, res);

    expect(order.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "Order cannot be cancelled at this stage",
    });
  });

  // 7. Customer cannot cancel another customer's order
  test("should reject cancellation by a customer who does not own the order", async () => {
    setOrder({
      status: "PLACED",
      customer: customerId,
    });

    setRequest("CANCELLED", "customer", "507f1f77bcf86cd799439099");

    await updateOrderStatus(req, res);

    expect(order.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  // 8. Customer cancels COD order
  test("should allow the order owner to cancel a placed COD order", async () => {
    setOrder({
      status: "PLACED",
      paymentMethod: "COD",
    });

    setRequest("CANCELLED", "customer");

    await updateOrderStatus(req, res);

    expect(order.status).toBe("CANCELLED");
    expect(order.save).toHaveBeenCalledTimes(1);
    expect(axios.patch).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // 9. Refund for paid online order
  test("should request a refund when cancelling a paid online order", async () => {
    setOrder({
      status: "PLACED",
      paymentMethod: "ONLINE",
      paymentStatus: "PAID",
    });

    setRequest("CANCELLED", "customer");

    await updateOrderStatus(req, res);

    expect(axios.patch).toHaveBeenCalledWith(
      "http://localhost:5005/api/payments/refund",
      {
        orderId: order._id,
      },
    );

    expect(order.status).toBe("CANCELLED");
    expect(order.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // 10. Release assigned delivery partner
  test("should release an assigned delivery partner during cancellation", async () => {
    setOrder({
      status: "PLACED",
      paymentMethod: "COD",
      deliveryPartner: deliveryPartnerId,
    });

    setRequest("CANCELLED", "customer");

    await updateOrderStatus(req, res);

    expect(axios.patch).toHaveBeenCalledWith(
      "http://localhost:5004/api/delivery/internal/release",
      {
        partnerId: deliveryPartnerId,
      },
    );

    expect(order.deliveryPartner).toBeNull();
    expect(order.status).toBe("CANCELLED");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // 11. Invalid delivery transition
  test("should reject an invalid delivery partner status transition", async () => {
    setOrder({
      status: "PLACED",
      deliveryPartner: deliveryPartnerId,
    });

    setRequest("DELIVERED", "delivery_partner");

    await updateOrderStatus(req, res);

    expect(order.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  // 12. No delivery partner assigned
  test("should reject delivery status update when no partner is assigned", async () => {
    setOrder({
      status: "READY",
      deliveryPartner: null,
    });

    setRequest("PICKED_UP", "delivery_partner");

    await updateOrderStatus(req, res);

    expect(order.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "No delivery partner assigned",
    });
  });

  // 13. Delivery partner picks up order
  test("should allow delivery partner to move order from READY to PICKED_UP", async () => {
    setOrder({
      status: "READY",
      deliveryPartner: deliveryPartnerId,
    });

    setRequest("PICKED_UP", "delivery_partner", deliveryPartnerId);

    await updateOrderStatus(req, res);

    expect(order.status).toBe("PICKED_UP");
    expect(order.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // 14. Publish order.ready event
  test("should publish order.ready event before updating order status", async () => {
    setOrder({
      status: "PREPARING",
    });

    setRequest("READY", "restaurant_owner");

    await updateOrderStatus(req, res);

    expect(axios.get).toHaveBeenCalledWith(
      `http://localhost:5002/api/restaurants/${restaurantId}`,
    );

    expect(channel.publish).toHaveBeenCalledTimes(1);

    expect(channel.publish).toHaveBeenCalledWith(
      "food_delivery_events",
      "order.ready",
      expect.any(Buffer),
    );

    expect(channel.waitForConfirms).toHaveBeenCalledTimes(1);

    expect(order.save).toHaveBeenCalledTimes(1);
    expect(order.status).toBe("READY");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // 15. Restaurant coordinates unavailable
  test("should reject READY transition when restaurant coordinates are unavailable", async () => {
    setOrder({
      status: "PREPARING",
    });

    setRequest("READY", "restaurant_owner");

    axios.get.mockResolvedValueOnce({
      data: {
        restaurant: {
          address: {
            latitude: null,
            longitude: null,
          },
        },
      },
    });

    await updateOrderStatus(req, res);

    expect(channel.publish).not.toHaveBeenCalled();
    expect(order.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "Restaurant location is not available",
    });
  });

  // 16. RabbitMQ confirmation failure
  test("should not update order when RabbitMQ confirmation fails", async () => {
    setOrder({
      status: "PREPARING",
    });

    setRequest("READY", "restaurant_owner");

    channel.waitForConfirms.mockRejectedValueOnce(
      new Error("RabbitMQ confirmation failed"),
    );

    await updateOrderStatus(req, res);

    expect(channel.publish).toHaveBeenCalledTimes(1);
    expect(order.save).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  // 17. Redis cache invalidation
  test("should invalidate order, customer, restaurant and delivery caches", async () => {
    setOrder({
      status: "READY",
      deliveryPartner: deliveryPartnerId,
    });

    setRequest("PICKED_UP", "delivery_partner", deliveryPartnerId);

    await updateOrderStatus(req, res);

    expect(redisClient.del).toHaveBeenCalledWith(
      expect.arrayContaining([
        `order:${orderId}`,
        `orders:customer:${customerId}`,
        `orders:restaurant:${restaurantId}`,
        `orders:delivery:${deliveryPartnerId}`,
      ]),
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });

  // 18. Redis failure
  test("should continue successfully when Redis cache invalidation fails", async () => {
    setOrder({
      status: "PLACED",
    });

    setRequest("CONFIRMED", "restaurant_owner");

    redisClient.del.mockRejectedValueOnce(new Error("Redis unavailable"));

    await updateOrderStatus(req, res);

    expect(order.status).toBe("CONFIRMED");
    expect(order.save).toHaveBeenCalledTimes(1);

    expect(console.error).toHaveBeenCalledWith(
      "Redis cache invalidation failed:",
      "Redis unavailable",
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });

  // 19. Delivery completion
  test("should notify Delivery Service when order is delivered", async () => {
    setOrder({
      status: "OUT_FOR_DELIVERY",
      deliveryPartner: deliveryPartnerId,
    });

    setRequest("DELIVERED", "delivery_partner", deliveryPartnerId);

    await updateOrderStatus(req, res);

    expect(order.status).toBe("DELIVERED");

    expect(axios.patch).toHaveBeenCalledWith(
      "http://localhost:5004/api/delivery/internal/complete",
      {
        partnerId: deliveryPartnerId,
      },
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });

  // 20. Delivery Service failure
  test("should return Delivery Service error when completion request fails", async () => {
    setOrder({
      status: "OUT_FOR_DELIVERY",
      deliveryPartner: deliveryPartnerId,
    });

    setRequest("DELIVERED", "delivery_partner", deliveryPartnerId);

    axios.patch.mockRejectedValueOnce({
      response: {
        status: 503,
        data: {
          message: "Delivery Service unavailable",
        },
      },
    });

    await updateOrderStatus(req, res);

    expect(order.status).toBe("DELIVERED");
    expect(order.save).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(503);

    expect(res.json).toHaveBeenCalledWith({
      message: "Delivery Service unavailable",
    });
  });
});
