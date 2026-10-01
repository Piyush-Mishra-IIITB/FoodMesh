const axios = require("axios");

jest.mock("axios");

jest.mock("../models/orderModel", () => ({
  findById: jest.fn(),
  find: jest.fn(),
}));

jest.mock("../models/outboxEventModel", () => ({
  create: jest.fn(),
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

const Order = require("../models/orderModel");
const { redisClient } = require("../config/redis");

const {
  getMyOrders,
  getOrderById,
  getRestaurantOrders,
  getDeliveryOrders,
  updatePaymentStatus,
  getPaymentStatus,
} = require("../controllers/orderController");

const CUSTOMER_ID = "507f1f77bcf86cd799439011";
const ORDER_ID = "507f1f77bcf86cd799439012";
const RESTAURANT_ID = "507f1f77bcf86cd799439013";
const DELIVERY_PARTNER_ID = "507f1f77bcf86cd799439014";

const createResponse = () => {
  const res = {};

  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);

  return res;
};

const createOrderDocument = (overrides = {}) => ({
  _id: ORDER_ID,
  customer: CUSTOMER_ID,
  restaurant: RESTAURANT_ID,
  deliveryPartner: null,
  paymentStatus: "PENDING",
  paymentMethod: "ONLINE",
  totalAmount: 500,
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const createSortedQuery = (orders) => ({
  sort: jest.fn().mockResolvedValue(orders),
});

describe("Order Controller Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    redisClient.get.mockResolvedValue(null);
    redisClient.set.mockResolvedValue("OK");
    redisClient.del.mockResolvedValue(1);

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================
  // GET MY ORDERS
  // =========================================

  describe("getMyOrders", () => {
    test("should return orders from MongoDB when cache is empty", async () => {
      const orders = [createOrderDocument()];

      redisClient.get.mockResolvedValue(null);
      Order.find.mockReturnValue(createSortedQuery(orders));

      const req = {
        user: { userId: CUSTOMER_ID },
      };

      const res = createResponse();

      await getMyOrders(req, res);

      expect(Order.find).toHaveBeenCalledWith({
        customer: CUSTOMER_ID,
      });

      expect(redisClient.set).toHaveBeenCalledWith(
        `orders:customer:${CUSTOMER_ID}`,
        JSON.stringify(orders),
        { EX: 600 },
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ orders });
    });

    test("should return cached orders without querying MongoDB", async () => {
      const orders = [{ _id: ORDER_ID, status: "PLACED" }];

      redisClient.get.mockResolvedValue(JSON.stringify(orders));

      const req = {
        user: { userId: CUSTOMER_ID },
      };

      const res = createResponse();

      await getMyOrders(req, res);

      expect(Order.find).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ orders });
    });

    test("should continue to MongoDB if Redis GET fails", async () => {
      const orders = [createOrderDocument()];

      redisClient.get.mockRejectedValue(new Error("Redis unavailable"));
      Order.find.mockReturnValue(createSortedQuery(orders));

      const req = {
        user: { userId: CUSTOMER_ID },
      };

      const res = createResponse();

      await getMyOrders(req, res);

      expect(Order.find).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test("should return 500 if MongoDB query fails", async () => {
      Order.find.mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error("Database error")),
      });

      const req = {
        user: { userId: CUSTOMER_ID },
      };

      const res = createResponse();

      await getMyOrders(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Server error",
      });
    });
  });

  // =========================================
  // GET ORDER BY ID
  // =========================================

  describe("getOrderById", () => {
    test("should reject an invalid order ID", async () => {
      const req = {
        params: { id: "invalid-id" },
        user: { userId: CUSTOMER_ID, role: "customer" },
      };

      const res = createResponse();

      await getOrderById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Invalid order ID",
      });
    });

    test("should return 404 when order does not exist", async () => {
      redisClient.get.mockResolvedValue(null);
      Order.findById.mockResolvedValue(null);

      const req = {
        params: { id: ORDER_ID },
        user: { userId: CUSTOMER_ID, role: "customer" },
      };

      const res = createResponse();

      await getOrderById(req, res);

      expect(Order.findById).toHaveBeenCalledWith(ORDER_ID);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Order not found",
      });
    });

    test("should prevent a customer from viewing another customer's order", async () => {
      const order = createOrderDocument({
        customer: "507f1f77bcf86cd799439099",
      });

      redisClient.get.mockResolvedValue(null);
      Order.findById.mockResolvedValue(order);

      const req = {
        params: { id: ORDER_ID },
        user: { userId: CUSTOMER_ID, role: "customer" },
      };

      const res = createResponse();

      await getOrderById(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "You are not allowed to view this order",
      });
    });

    test("should return an order belonging to the customer", async () => {
      const order = createOrderDocument();

      redisClient.get.mockResolvedValue(null);
      Order.findById.mockResolvedValue(order);

      const req = {
        params: { id: ORDER_ID },
        user: { userId: CUSTOMER_ID, role: "customer" },
      };

      const res = createResponse();

      await getOrderById(req, res);

      expect(redisClient.set).toHaveBeenCalledWith(
        `order:${ORDER_ID}`,
        JSON.stringify(order),
        { EX: 600 },
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ order });
    });

    test("should return cached order without querying MongoDB", async () => {
      const order = createOrderDocument();

      // Redis stores JSON, so the cached result has no Mongoose methods.
      const cachedOrder = JSON.parse(JSON.stringify(order));

      redisClient.get.mockResolvedValue(JSON.stringify(order));

      const req = {
        params: { id: ORDER_ID },
        user: { userId: CUSTOMER_ID, role: "customer" },
      };

      const res = createResponse();

      await getOrderById(req, res);

      expect(Order.findById).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        order: cachedOrder,
      });
    });

    test("should allow a non-customer role to view an existing order", async () => {
      const order = createOrderDocument({
        customer: "507f1f77bcf86cd799439099",
      });

      redisClient.get.mockResolvedValue(null);
      Order.findById.mockResolvedValue(order);

      const req = {
        params: { id: ORDER_ID },
        user: {
          userId: "507f1f77bcf86cd799439098",
          role: "admin",
        },
      };

      const res = createResponse();

      await getOrderById(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // =========================================
  // GET RESTAURANT ORDERS
  // =========================================

  describe("getRestaurantOrders", () => {
    test("should return restaurant orders", async () => {
      const orders = [createOrderDocument()];

      axios.get.mockResolvedValue({
        data: {
          restaurant: { id: RESTAURANT_ID },
        },
      });

      redisClient.get.mockResolvedValue(null);
      Order.find.mockReturnValue(createSortedQuery(orders));

      const req = {
        user: { userId: CUSTOMER_ID },
      };

      const res = createResponse();

      await getRestaurantOrders(req, res);

      expect(Order.find).toHaveBeenCalledWith({
        restaurant: RESTAURANT_ID,
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ orders });
    });

    test("should return cached restaurant orders", async () => {
      const orders = [{ _id: ORDER_ID }];

      axios.get.mockResolvedValue({
        data: {
          restaurant: { id: RESTAURANT_ID },
        },
      });

      redisClient.get.mockResolvedValue(JSON.stringify(orders));

      const req = {
        user: { userId: CUSTOMER_ID },
      };

      const res = createResponse();

      await getRestaurantOrders(req, res);

      expect(Order.find).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ orders });
    });

    test("should forward Restaurant Service errors", async () => {
      axios.get.mockRejectedValue({
        response: {
          status: 404,
          data: { message: "Restaurant not found" },
        },
      });

      const req = {
        user: { userId: CUSTOMER_ID },
      };

      const res = createResponse();

      await getRestaurantOrders(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Restaurant not found",
      });
    });
  });

  // =========================================
  // GET DELIVERY ORDERS
  // =========================================

  describe("getDeliveryOrders", () => {
    test("should return delivery partner orders", async () => {
      const orders = [createOrderDocument()];

      axios.get.mockResolvedValue({
        data: {
          deliveryPartner: { id: DELIVERY_PARTNER_ID },
        },
      });

      redisClient.get.mockResolvedValue(null);
      Order.find.mockReturnValue(createSortedQuery(orders));

      const req = {
        user: { userId: CUSTOMER_ID },
      };

      const res = createResponse();

      await getDeliveryOrders(req, res);

      expect(Order.find).toHaveBeenCalledWith({
        deliveryPartner: DELIVERY_PARTNER_ID,
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ orders });
    });

    test("should return cached delivery orders", async () => {
      const orders = [{ _id: ORDER_ID }];

      axios.get.mockResolvedValue({
        data: {
          deliveryPartner: { id: DELIVERY_PARTNER_ID },
        },
      });

      redisClient.get.mockResolvedValue(JSON.stringify(orders));

      const req = {
        user: { userId: CUSTOMER_ID },
      };

      const res = createResponse();

      await getDeliveryOrders(req, res);

      expect(Order.find).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ orders });
    });

    test("should forward Delivery Service errors", async () => {
      axios.get.mockRejectedValue({
        response: {
          status: 404,
          data: { message: "Delivery partner not found" },
        },
      });

      const req = {
        user: { userId: CUSTOMER_ID },
      };

      const res = createResponse();

      await getDeliveryOrders(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Delivery partner not found",
      });
    });
  });

  // =========================================
  // UPDATE PAYMENT STATUS
  // =========================================

  describe("updatePaymentStatus", () => {
    test("should reject a request without orderId or status", async () => {
      const req = {
        body: {},
      };

      const res = createResponse();

      await updatePaymentStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Order ID and payment status are required",
      });
    });

    test("should reject an invalid payment status", async () => {
      const req = {
        body: {
          orderId: ORDER_ID,
          status: "PROCESSING",
        },
      };

      const res = createResponse();

      await updatePaymentStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Invalid payment status",
      });

      expect(Order.findById).not.toHaveBeenCalled();
    });

    test.each(["PAID", "FAILED", "REFUNDED"])(
      "should update payment status to %s",
      async (status) => {
        const order = createOrderDocument();

        Order.findById.mockResolvedValue(order);

        const req = {
          body: {
            orderId: ORDER_ID,
            status,
          },
        };

        const res = createResponse();

        await updatePaymentStatus(req, res);

        expect(Order.findById).toHaveBeenCalledWith(ORDER_ID);
        expect(order.paymentStatus).toBe(status);
        expect(order.save).toHaveBeenCalledTimes(1);
        expect(redisClient.del).toHaveBeenCalled();

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
          message: "Payment status updated successfully",
          order,
        });
      },
    );

    test("should return 404 if order does not exist", async () => {
      Order.findById.mockResolvedValue(null);

      const req = {
        body: {
          orderId: ORDER_ID,
          status: "PAID",
        },
      };

      const res = createResponse();

      await updatePaymentStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Order not found",
      });
    });

    test("should return 500 if database operation fails", async () => {
      Order.findById.mockRejectedValue(new Error("Database error"));

      const req = {
        body: {
          orderId: ORDER_ID,
          status: "PAID",
        },
      };

      const res = createResponse();

      await updatePaymentStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Server error",
      });
    });

    test("should continue successfully if Redis cache invalidation fails", async () => {
      const order = createOrderDocument();

      Order.findById.mockResolvedValue(order);
      redisClient.del.mockRejectedValue(new Error("Redis unavailable"));

      const req = {
        body: {
          orderId: ORDER_ID,
          status: "PAID",
        },
      };

      const res = createResponse();

      await updatePaymentStatus(req, res);

      expect(order.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // =========================================
  // GET PAYMENT STATUS
  // =========================================

  describe("getPaymentStatus", () => {
    test("should reject an invalid order ID", async () => {
      const req = {
        params: { orderId: "invalid-id" },
      };

      const res = createResponse();

      await getPaymentStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Invalid order ID",
      });
    });

    test("should return 404 if order does not exist", async () => {
      Order.findById.mockResolvedValue(null);

      const req = {
        params: { orderId: ORDER_ID },
      };

      const res = createResponse();

      await getPaymentStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Order not found",
      });
    });

    test("should return payment details for an existing order", async () => {
      const order = createOrderDocument();

      Order.findById.mockResolvedValue(order);

      const req = {
        params: { orderId: ORDER_ID },
      };

      const res = createResponse();

      await getPaymentStatus(req, res);

      expect(Order.findById).toHaveBeenCalledWith(ORDER_ID);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        orderId: ORDER_ID,
        paymentStatus: "PENDING",
        paymentMethod: "ONLINE",
        totalAmount: 500,
      });
    });

    test("should return 500 if database operation fails", async () => {
      Order.findById.mockRejectedValue(new Error("Database error"));

      const req = {
        params: { orderId: ORDER_ID },
      };

      const res = createResponse();

      await getPaymentStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Server error",
      });
    });
  });
});
