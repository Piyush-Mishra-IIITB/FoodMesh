jest.mock("axios", () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
}));

jest.mock("../models/orderModel", () => ({
  findById: jest.fn(),
}));

jest.mock("../config/redis", () => ({
  redisClient: {
    del: jest.fn(),
  },
}));

const axios = require("axios");
const Order = require("../models/orderModel");
const { redisClient } = require("../config/redis");

const { assignDeliveryPartner } = require("../controllers/orderController");

const orderId = "507f1f77bcf86cd799439011";
const customerId = "507f1f77bcf86cd799439012";
const restaurantId = "507f1f77bcf86cd799439013";
const ownerId = "507f1f77bcf86cd799439015";
const deliveryPartnerId = "507f1f77bcf86cd799439014";

const restaurantUrl = "http://localhost:5002";
const deliveryUrl = "http://localhost:5004";

const createOrder = (overrides = {}) => ({
  _id: orderId,
  customer: customerId,
  restaurant: restaurantId,
  deliveryPartner: null,
  status: "READY",
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const createResponse = () => {
  const res = {};

  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);

  return res;
};

describe("Assign Delivery Partner Controller Tests", () => {
  let req;
  let res;
  let order;
  let partner;

  beforeEach(() => {
    jest.resetAllMocks();

    order = createOrder();

    partner = {
      _id: deliveryPartnerId,
      user: ownerId,
      isOnline: true,
      isAvailable: true,
    };

    req = {
      params: {
        id: orderId,
      },
      user: {
        userId: ownerId,
        role: "restaurant_owner",
      },
    };

    res = createResponse();

    Order.findById.mockResolvedValue(order);

    // Restaurant owner lookup
    axios.get.mockResolvedValueOnce({
      data: {
        restaurant: {
          id: restaurantId,
        },
      },
    });

    // Restaurant details lookup
    axios.get.mockResolvedValueOnce({
      data: {
        restaurant: {
          address: {
            latitude: 23.2599,
            longitude: 77.4126,
          },
        },
      },
    });

    // Find nearest delivery partner
    axios.post.mockResolvedValue({
      data: {
        partner,
      },
    });

    // Mark partner as busy
    axios.patch.mockResolvedValue({
      data: {
        message: "Delivery partner assigned",
      },
    });

    redisClient.del.mockResolvedValue(4);

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 1. Invalid order ID
  test("should return 400 for an invalid order ID", async () => {
    req.params.id = "invalid-id";

    await assignDeliveryPartner(req, res);

    expect(Order.findById).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid order ID",
    });
  });

  // 2. Order not found
  test("should return 404 when order does not exist", async () => {
    Order.findById.mockResolvedValueOnce(null);

    await assignDeliveryPartner(req, res);

    expect(res.status).toHaveBeenCalledWith(404);

    expect(res.json).toHaveBeenCalledWith({
      message: "Order not found",
    });
  });

  // 3. Restaurant owner lookup
  test("should fetch the restaurant belonging to the logged-in owner", async () => {
    await assignDeliveryPartner(req, res);

    expect(axios.get).toHaveBeenNthCalledWith(
      1,
      `${restaurantUrl}/api/restaurants/owner/${ownerId}`,
    );
  });

  // 4. Restaurant ownership mismatch
  test("should reject assignment when restaurant does not belong to the owner", async () => {
    axios.get.mockReset();

    axios.get.mockResolvedValueOnce({
      data: {
        restaurant: {
          id: "507f1f77bcf86cd799439099",
        },
      },
    });

    await assignDeliveryPartner(req, res);

    expect(res.status).toHaveBeenCalledWith(403);

    expect(res.json).toHaveBeenCalledWith({
      message: "You are not allowed to assign delivery for this restaurant",
    });

    expect(axios.post).not.toHaveBeenCalled();
    expect(order.save).not.toHaveBeenCalled();
  });

  // 5. Order is not READY
  test("should reject assignment when order is not READY", async () => {
    order.status = "PREPARING";

    await assignDeliveryPartner(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "Delivery partner can only be assigned when order is READY",
    });

    expect(axios.post).not.toHaveBeenCalled();
    expect(order.save).not.toHaveBeenCalled();
  });

  // 6. Partner already assigned
  test("should reject assignment when a delivery partner is already assigned", async () => {
    order.deliveryPartner = deliveryPartnerId;

    await assignDeliveryPartner(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "Delivery partner already assigned",
    });

    expect(axios.post).not.toHaveBeenCalled();
    expect(order.save).not.toHaveBeenCalled();
  });

  // 7. Restaurant details lookup
  test("should fetch restaurant details before finding a delivery partner", async () => {
    await assignDeliveryPartner(req, res);

    expect(axios.get).toHaveBeenNthCalledWith(
      2,
      `${restaurantUrl}/api/restaurants/${restaurantId}`,
    );
  });

  // 8. Invalid restaurant coordinates
  test("should reject assignment when restaurant coordinates are unavailable", async () => {
    axios.get.mockReset();

    axios.get
      .mockResolvedValueOnce({
        data: {
          restaurant: {
            id: restaurantId,
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          restaurant: {
            address: {
              latitude: null,
              longitude: null,
            },
          },
        },
      });

    await assignDeliveryPartner(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "Restaurant location is not available",
    });

    expect(axios.post).not.toHaveBeenCalled();
    expect(order.save).not.toHaveBeenCalled();
  });

  // 9. Find nearest delivery partner
  test("should request the nearest delivery partner using restaurant coordinates", async () => {
    await assignDeliveryPartner(req, res);

    expect(axios.post).toHaveBeenCalledWith(
      `${deliveryUrl}/api/delivery/internal/nearest`,
      {
        latitude: 23.2599,
        longitude: 77.4126,
      },
    );
  });

  // 10. Mark delivery partner as busy
  test("should mark the selected delivery partner as busy", async () => {
    await assignDeliveryPartner(req, res);

    expect(axios.patch).toHaveBeenNthCalledWith(
      1,
      `${deliveryUrl}/api/delivery/internal/assign`,
      {
        partnerId: deliveryPartnerId,
      },
    );
  });

  // 11. Successful assignment
  test("should successfully assign a delivery partner to the order", async () => {
    await assignDeliveryPartner(req, res);

    expect(order.deliveryPartner).toBe(deliveryPartnerId);
    expect(order.save).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(200);

    expect(res.json).toHaveBeenCalledWith({
      message: "Delivery partner assigned successfully",
      order,
      deliveryPartner: partner,
    });
  });

  // 12. Redis cache invalidation
  test("should invalidate order, customer, restaurant and delivery caches", async () => {
    await assignDeliveryPartner(req, res);

    expect(redisClient.del).toHaveBeenCalledWith([
      `order:${orderId}`,
      `orders:customer:${customerId}`,
      `orders:restaurant:${restaurantId}`,
      `orders:delivery:${deliveryPartnerId}`,
    ]);
  });

  // 13. Redis failure
  test("should still return success when Redis cache invalidation fails", async () => {
    redisClient.del.mockRejectedValueOnce(new Error("Redis unavailable"));

    await assignDeliveryPartner(req, res);

    expect(order.save).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);

    expect(console.error).toHaveBeenCalledWith(
      "Redis cache invalidation failed:",
      "Redis unavailable",
    );
  });

  // 14. Order save failure and partner release
  test("should release the delivery partner if saving the order fails", async () => {
    order.save.mockRejectedValueOnce(new Error("Database save failed"));

    await assignDeliveryPartner(req, res);

    expect(axios.patch).toHaveBeenNthCalledWith(
      1,
      `${deliveryUrl}/api/delivery/internal/assign`,
      {
        partnerId: deliveryPartnerId,
      },
    );

    expect(axios.patch).toHaveBeenNthCalledWith(
      2,
      `${deliveryUrl}/api/delivery/internal/release`,
      {
        partnerId: deliveryPartnerId,
      },
    );

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      message: "Server error",
    });
  });

  // 15. Restaurant Service error
  test("should return the Restaurant Service error status", async () => {
    axios.get.mockReset();

    axios.get.mockRejectedValueOnce({
      response: {
        status: 503,
        data: {
          message: "Restaurant Service unavailable",
        },
      },
    });

    await assignDeliveryPartner(req, res);

    expect(res.status).toHaveBeenCalledWith(503);

    expect(res.json).toHaveBeenCalledWith({
      message: "Restaurant Service unavailable",
    });

    expect(order.save).not.toHaveBeenCalled();
  });

  // 16. Delivery Service nearest partner error
  test("should return an error when Delivery Service cannot find a partner", async () => {
    axios.post.mockRejectedValueOnce({
      response: {
        status: 404,
        data: {
          message: "No available delivery partner",
        },
      },
    });

    await assignDeliveryPartner(req, res);

    expect(res.status).toHaveBeenCalledWith(404);

    expect(res.json).toHaveBeenCalledWith({
      message: "No available delivery partner",
    });

    expect(order.save).not.toHaveBeenCalled();
  });

  // 17. Delivery Service assignment error
  test("should return an error when marking the partner as busy fails", async () => {
    axios.patch.mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          message: "Delivery partner is no longer available",
        },
      },
    });

    await assignDeliveryPartner(req, res);

    expect(res.status).toHaveBeenCalledWith(409);

    expect(res.json).toHaveBeenCalledWith({
      message: "Delivery partner is no longer available",
    });

    expect(order.save).not.toHaveBeenCalled();
  });
});
