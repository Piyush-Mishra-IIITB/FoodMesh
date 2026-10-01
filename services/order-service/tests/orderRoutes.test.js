process.env.JWT_SECRET = "test-order-service-secret";

const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");

const controller = require("../controllers/orderController");

// Mock controller functions so these tests focus on routes and middleware.
jest.mock("../controllers/orderController", () => ({
  createOrder: jest.fn((req, res) =>
    res.status(200).json({ handler: "createOrder" }),
  ),
  getMyOrders: jest.fn((req, res) =>
    res.status(200).json({ handler: "getMyOrders" }),
  ),
  getOrderById: jest.fn((req, res) =>
    res.status(200).json({ handler: "getOrderById" }),
  ),
  updateOrderStatus: jest.fn((req, res) =>
    res.status(200).json({ handler: "updateOrderStatus" }),
  ),
  assignDeliveryPartner: jest.fn((req, res) =>
    res.status(200).json({ handler: "assignDeliveryPartner" }),
  ),
  getDeliveryOrders: jest.fn((req, res) =>
    res.status(200).json({ handler: "getDeliveryOrders" }),
  ),
  getRestaurantOrders: jest.fn((req, res) =>
    res.status(200).json({ handler: "getRestaurantOrders" }),
  ),
  updatePaymentStatus: jest.fn((req, res) =>
    res.status(200).json({ handler: "updatePaymentStatus" }),
  ),
  getPaymentStatus: jest.fn((req, res) =>
    res.status(200).json({ handler: "getPaymentStatus" }),
  ),
}));

const generateToken = (role) => {
  return jwt.sign(
    {
      userId: "507f1f77bcf86cd799439011",
      role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
};

const authCookie = (role) => {
  return `token=${generateToken(role)}`;
};

describe("Order Service Route and Middleware Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Authentication tests

  test("should reject a request without a token", async () => {
    const response = await request(app).get("/api/orders/my");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Authentication required");
  });

  test("should reject an invalid token", async () => {
    const response = await request(app)
      .get("/api/orders/my")
      .set("Cookie", "token=invalid-token");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid or expired token");
  });

  test("should allow a customer with a valid token to access their orders", async () => {
    const response = await request(app)
      .get("/api/orders/my")
      .set("Cookie", authCookie("customer"));

    expect(response.status).toBe(200);
    expect(response.body.handler).toBe("getMyOrders");
    expect(controller.getMyOrders).toHaveBeenCalledTimes(1);
  });

  // Customer routes

  test("should allow a customer to create an order", async () => {
    const response = await request(app)
      .post("/api/orders")
      .set("Cookie", authCookie("customer"))
      .send({ paymentMethod: "COD" });

    expect(response.status).toBe(200);
    expect(response.body.handler).toBe("createOrder");
    expect(controller.createOrder).toHaveBeenCalledTimes(1);
  });

  test("should reject a restaurant owner attempting to create an order", async () => {
    const response = await request(app)
      .post("/api/orders")
      .set("Cookie", authCookie("restaurant_owner"))
      .send({ paymentMethod: "COD" });

    expect(response.status).toBe(403);
    expect(response.body.message).toBe(
      "You are not authorized to perform this action",
    );
    expect(controller.createOrder).not.toHaveBeenCalled();
  });

  // Restaurant owner routes

  test("should allow a restaurant owner to access restaurant orders", async () => {
    const response = await request(app)
      .get("/api/orders/restaurant")
      .set("Cookie", authCookie("restaurant_owner"));

    expect(response.status).toBe(200);
    expect(response.body.handler).toBe("getRestaurantOrders");
    expect(controller.getRestaurantOrders).toHaveBeenCalledTimes(1);
  });

  test("should reject a customer attempting to access restaurant orders", async () => {
    const response = await request(app)
      .get("/api/orders/restaurant")
      .set("Cookie", authCookie("customer"));

    expect(response.status).toBe(403);
    expect(controller.getRestaurantOrders).not.toHaveBeenCalled();
  });

  // Delivery partner routes

  test("should allow a delivery partner to access delivery orders", async () => {
    const response = await request(app)
      .get("/api/orders/delivery")
      .set("Cookie", authCookie("delivery_partner"));

    expect(response.status).toBe(200);
    expect(response.body.handler).toBe("getDeliveryOrders");
    expect(controller.getDeliveryOrders).toHaveBeenCalledTimes(1);
  });

  test("should reject a customer attempting to access delivery orders", async () => {
    const response = await request(app)
      .get("/api/orders/delivery")
      .set("Cookie", authCookie("customer"));

    expect(response.status).toBe(403);
    expect(controller.getDeliveryOrders).not.toHaveBeenCalled();
  });

  // Routes accessible to multiple roles

  test("should allow an authenticated user to access an individual order route", async () => {
    const response = await request(app)
      .get("/api/orders/507f1f77bcf86cd799439011")
      .set("Cookie", authCookie("customer"));

    expect(response.status).toBe(200);
    expect(response.body.handler).toBe("getOrderById");
  });

  test("should allow a delivery partner to update order status", async () => {
    const response = await request(app)
      .patch("/api/orders/507f1f77bcf86cd799439011/status")
      .set("Cookie", authCookie("delivery_partner"))
      .send({ status: "PICKED_UP" });

    expect(response.status).toBe(200);
    expect(response.body.handler).toBe("updateOrderStatus");
  });

  test("should reject an admin attempting to update order status", async () => {
    const response = await request(app)
      .patch("/api/orders/507f1f77bcf86cd799439011/status")
      .set("Cookie", authCookie("admin"))
      .send({ status: "PICKED_UP" });

    expect(response.status).toBe(403);
    expect(controller.updateOrderStatus).not.toHaveBeenCalled();
  });

  test("should allow a restaurant owner to assign a delivery partner", async () => {
    const response = await request(app)
      .patch("/api/orders/507f1f77bcf86cd799439011/assign")
      .set("Cookie", authCookie("restaurant_owner"));

    expect(response.status).toBe(200);
    expect(response.body.handler).toBe("assignDeliveryPartner");
  });

  test("should allow an admin to assign a delivery partner", async () => {
    const response = await request(app)
      .patch("/api/orders/507f1f77bcf86cd799439011/assign")
      .set("Cookie", authCookie("admin"));

    expect(response.status).toBe(200);
    expect(response.body.handler).toBe("assignDeliveryPartner");
  });

  test("should reject a customer attempting to assign a delivery partner", async () => {
    const response = await request(app)
      .patch("/api/orders/507f1f77bcf86cd799439011/assign")
      .set("Cookie", authCookie("customer"));

    expect(response.status).toBe(403);
    expect(controller.assignDeliveryPartner).not.toHaveBeenCalled();
  });
});
