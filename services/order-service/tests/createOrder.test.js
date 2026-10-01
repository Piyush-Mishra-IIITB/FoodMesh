jest.mock("mongoose", () => ({
  Types: {
    ObjectId: {
      isValid: jest.fn(),
    },
  },
  startSession: jest.fn(),
}));

jest.mock("axios", () => ({
  post: jest.fn(),
}));

jest.mock("../models/orderModel", () => ({
  create: jest.fn(),
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

const mongoose = require("mongoose");
const axios = require("axios");
const Order = require("../models/orderModel");
const OutboxEvent = require("../models/outboxEventModel");
const { redisClient } = require("../config/redis");

const { createOrder } = require("../controllers/orderController");

const restaurantId = "507f1f77bcf86cd799439011";
const customerId = "507f1f77bcf86cd799439012";
const orderId = "507f1f77bcf86cd799439013";

const menuItems = [
  {
    menuItem: "507f1f77bcf86cd799439014",
    quantity: 2,
  },
];

const validatedItems = [
  {
    menuItem: "507f1f77bcf86cd799439014",
    name: "Pizza",
    price: 200,
    quantity: 2,
  },
];

const deliveryAddress = {
  street: "Main Road",
  city: "Bhopal",
  state: "Madhya Pradesh",
  pincode: "462001",
};

const createdOrder = {
  _id: orderId,
  customer: customerId,
  restaurant: restaurantId,
  items: validatedItems,
  deliveryAddress,
  totalAmount: 400,
  paymentMethod: "COD",
};

const updatedOrder = {
  ...createdOrder,
  status: "PLACED",
};

const createResponse = () => {
  const res = {};

  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);

  return res;
};

describe("Create Order Controller Tests", () => {
  let req;
  let res;
  let session;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      user: {
        userId: customerId,
        role: "customer",
      },
      body: {
        restaurant: restaurantId,
        items: menuItems,
        deliveryAddress,
        paymentMethod: "COD",
      },
    };

    res = createResponse();

    session = {
      withTransaction: jest.fn(async (callback) => callback()),
      endSession: jest.fn().mockResolvedValue(true),
    };

    mongoose.Types.ObjectId.isValid.mockReturnValue(true);
    mongoose.startSession.mockResolvedValue(session);

    axios.post.mockResolvedValue({
      data: {
        items: validatedItems,
        totalAmount: 400,
      },
    });

    Order.create.mockResolvedValue([createdOrder]);
    Order.findById.mockResolvedValue(updatedOrder);

    OutboxEvent.create.mockResolvedValue([
      {
        eventType: "order.created",
      },
    ]);

    redisClient.del.mockResolvedValue(2);

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("should reject order when required fields are missing", async () => {
    req.body = {};

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "Please provide all required fields",
    });

    expect(axios.post).not.toHaveBeenCalled();
  });

  test("should reject order when items array is empty", async () => {
    req.body.items = [];

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "Please provide all required fields",
    });

    expect(axios.post).not.toHaveBeenCalled();
  });

  test("should reject an invalid restaurant ID", async () => {
    mongoose.Types.ObjectId.isValid.mockReturnValue(false);

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid restaurant ID",
    });

    expect(axios.post).not.toHaveBeenCalled();
  });

  test("should reject an invalid payment method", async () => {
    req.body.paymentMethod = "CRYPTO";

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid payment method",
    });

    expect(axios.post).not.toHaveBeenCalled();
  });

  test("should validate menu items through Restaurant Service", async () => {
    await createOrder(req, res);

    expect(axios.post).toHaveBeenCalledWith(
      "http://localhost:5002/api/menu/internal/validate",
      {
        restaurantId,
        items: menuItems,
      },
    );
  });

  test("should create order and outbox event inside the same transaction", async () => {
    await createOrder(req, res);

    expect(mongoose.startSession).toHaveBeenCalledTimes(1);

    expect(session.withTransaction).toHaveBeenCalledTimes(1);

    expect(Order.create).toHaveBeenCalledWith(
      [
        {
          customer: customerId,
          restaurant: restaurantId,
          items: validatedItems,
          deliveryAddress,
          totalAmount: 400,
          paymentMethod: "COD",
        },
      ],
      {
        session,
      },
    );

    expect(OutboxEvent.create).toHaveBeenCalledWith(
      [
        {
          eventType: "order.created",
          exchange: "food_delivery_events",
          routingKey: "order.created",
          payload: {
            orderId: createdOrder._id,
            customer: createdOrder.customer,
            restaurant: createdOrder.restaurant,
            amount: createdOrder.totalAmount,
            paymentMethod: createdOrder.paymentMethod,
          },
          status: "PENDING",
        },
      ],
      {
        session,
      },
    );

    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  test("should return the created order with status 201", async () => {
    await createOrder(req, res);

    expect(Order.findById).toHaveBeenCalledWith(orderId);

    expect(res.status).toHaveBeenCalledWith(201);

    expect(res.json).toHaveBeenCalledWith({
      message: "Order created successfully",
      order: updatedOrder,
    });
  });

  test("should invalidate customer and restaurant Redis caches", async () => {
    await createOrder(req, res);

    expect(redisClient.del).toHaveBeenCalledWith([
      `orders:customer:${customerId}`,
      `orders:restaurant:${restaurantId}`,
    ]);
  });

  test("should still create order when Redis cache invalidation fails", async () => {
    redisClient.del.mockRejectedValue(new Error("Redis unavailable"));

    await createOrder(req, res);

    expect(console.error).toHaveBeenCalledWith(
      "Redis cache invalidation failed:",
      "Redis unavailable",
    );

    expect(res.status).toHaveBeenCalledWith(201);

    expect(res.json).toHaveBeenCalledWith({
      message: "Order created successfully",
      order: updatedOrder,
    });
  });

  test("should return Restaurant Service error status and message", async () => {
    axios.post.mockRejectedValue({
      response: {
        status: 404,
        data: {
          message: "Restaurant not found",
        },
      },
    });

    await createOrder(req, res);

    expect(res.status).toHaveBeenCalledWith(404);

    expect(res.json).toHaveBeenCalledWith({
      message: "Restaurant not found",
    });

    expect(mongoose.startSession).not.toHaveBeenCalled();
  });

  test("should return 500 when transaction fails", async () => {
    session.withTransaction.mockRejectedValue(new Error("Transaction failed"));

    await createOrder(req, res);

    expect(session.endSession).toHaveBeenCalledTimes(1);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      message: "Server error",
    });
  });
});
