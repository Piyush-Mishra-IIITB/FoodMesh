jest.setTimeout(30000);
const request = require("supertest");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const app = require("../index");

const User = require("../models/user");
const Restaurant = require("../models/restaurantModel");
const MenuItem = require("../models/menuItemModel");
const DeliveryPartner = require("../models/deliveryPartnerModel");
const Order = require("../models/orderModel");

describe("FOOD DELIVERY - COMPLETE FLOW", () => {
  let customer;
  let restaurantOwner;
  let deliveryUser;

  let restaurantId;
  let menuItemId;
  let deliveryPartnerId;

  let codOrderId;
  let onlineOrderId;

  // Separate agents maintain cookies
  const customerAgent = request.agent(app);
  const restaurantAgent = request.agent(app);
  const deliveryAgent = request.agent(app);

  const random = Date.now();

  const customerData = {
    name: "Test Customer",
    email: `customer${random}@test.com`,
    password: "password123",
    phone: `9${String(random).slice(-9)}`,
    role: "customer",
  };

  const restaurantOwnerData = {
    name: "Test Restaurant Owner",
    email: `owner${random}@test.com`,
    password: "password123",
    phone: `8${String(random).slice(-9)}`,
    role: "restaurant_owner",
  };

  const deliveryUserData = {
    name: "Test Delivery Partner",
    email: `delivery${random}@test.com`,
    password: "password123",
    phone: `7${String(random).slice(-9)}`,
    role: "delivery_partner",
  };

  // =====================================================
  // WAIT FOR MONGODB
  // =====================================================

  beforeAll(async () => {
    await connectDB();
    console.log("Test database connected");
  });

  // =====================================================
  // 1. REGISTER CUSTOMER
  // =====================================================

  test("Register customer", async () => {
    const response = await request(app)
      .post("/api/users/register")
      .send(customerData);

    expect(response.statusCode).toBe(201);

    expect(response.body).toHaveProperty("message");

    console.log("Customer registered");
  });

  // =====================================================
  // 2. REGISTER RESTAURANT OWNER
  // =====================================================

  test("Register restaurant owner", async () => {
    const response = await request(app)
      .post("/api/users/register")
      .send(restaurantOwnerData);

    expect(response.statusCode).toBe(201);

    console.log("Restaurant owner registered");
  });

  // =====================================================
  // 3. REGISTER DELIVERY PARTNER
  // =====================================================

  test("Register delivery partner", async () => {
    const response = await request(app)
      .post("/api/users/register")
      .send(deliveryUserData);

    expect(response.statusCode).toBe(201);

    console.log("Delivery partner registered");
  });

  // =====================================================
  // 4. LOGIN CUSTOMER
  // =====================================================

  test("Login customer", async () => {
    const response = await customerAgent.post("/api/users/login").send({
      email: customerData.email,
      password: customerData.password,
    });

    expect(response.statusCode).toBe(200);

    console.log("Customer logged in");
  });

  // =====================================================
  // 5. LOGIN RESTAURANT OWNER
  // =====================================================

  test("Login restaurant owner", async () => {
    const response = await restaurantAgent.post("/api/users/login").send({
      email: restaurantOwnerData.email,
      password: restaurantOwnerData.password,
    });

    expect(response.statusCode).toBe(200);

    console.log("Restaurant owner logged in");
  });

  // =====================================================
  // 6. LOGIN DELIVERY PARTNER
  // =====================================================

  test("Login delivery partner", async () => {
    const response = await deliveryAgent.post("/api/users/login").send({
      email: deliveryUserData.email,
      password: deliveryUserData.password,
    });

    expect(response.statusCode).toBe(200);

    console.log("Delivery partner logged in");
  });

  // =====================================================
  // 7. CREATE RESTAURANT
  // =====================================================

  test("Create restaurant", async () => {
    const response = await restaurantAgent.post("/api/restaurants").send({
      name: `Test Restaurant ${random}`,
      description: "Test restaurant",
      phone: "9876543210",

      address: {
        street: "MP Nagar",
        city: "Bhopal",
        state: "Madhya Pradesh",
        pincode: "462011",

        latitude: 23.2599,
        longitude: 77.4126,
      },

      cuisine: ["Indian", "North Indian"],

      isOpen: true,
    });

    expect(response.statusCode).toBe(201);

    restaurantId = response.body.restaurant?._id || response.body._id;

    expect(restaurantId).toBeDefined();

    console.log("Restaurant created:", restaurantId);
  });

  // =====================================================
  // 8. CREATE MENU ITEM
  // =====================================================

  test("Create menu item", async () => {
    const response = await restaurantAgent.post("/api/menu").send({
      restaurant: restaurantId,

      name: "Paneer Burger",

      description: "Test paneer burger",

      price: 150,

      category: "Burger",

      isVegetarian: true,

      isAvailable: true,
    });

    expect(response.statusCode).toBe(201);

    menuItemId = response.body.menuItem?._id || response.body._id;

    expect(menuItemId).toBeDefined();

    console.log("Menu item created:", menuItemId);
  });

  // =====================================================
  // 9. CREATE DELIVERY PARTNER PROFILE
  // =====================================================

  test("Create delivery partner profile", async () => {
    const response = await deliveryAgent.post("/api/delivery").send({
      vehicleType: "bike",

      vehicleNumber: `MP04TEST${random}`,

      licenseNumber: `DLTEST${random}`,
    });

    expect(response.statusCode).toBe(201);

    deliveryPartnerId = response.body.deliveryPartner?._id || response.body._id;

    expect(deliveryPartnerId).toBeDefined();

    console.log("Delivery partner created:", deliveryPartnerId);
  });

  // =====================================================
  // 10. DELIVERY PARTNER GOES ONLINE
  // =====================================================

  test("Delivery partner goes online", async () => {
    const response = await deliveryAgent
      .patch("/api/delivery/status/online")
      .send({
        isOnline: true,
      });

    expect(response.statusCode).toBe(200);

    console.log("Delivery partner online");
  });

  // =====================================================
  // 11. UPDATE DELIVERY PARTNER LOCATION
  // =====================================================

  test("Update delivery partner location", async () => {
    const response = await deliveryAgent.patch("/api/delivery/location").send({
      latitude: 23.2605,
      longitude: 77.413,
    });

    expect(response.statusCode).toBe(200);

    console.log("Delivery partner location updated");
  });

  // =====================================================
  // 12. CREATE COD ORDER
  // =====================================================

  test("Customer creates COD order", async () => {
    const response = await customerAgent.post("/api/orders").send({
      restaurant: restaurantId,

      items: [
        {
          menuItem: menuItemId,
          quantity: 2,
        },
      ],

      deliveryAddress: {
        street: "MP Nagar",
        city: "Bhopal",
        state: "Madhya Pradesh",
        pincode: "462011",
      },

      paymentMethod: "COD",
    });

    expect(response.statusCode).toBe(201);

    codOrderId = response.body.order._id;

    expect(codOrderId).toBeDefined();

    expect(response.body.order.status).toBe("PLACED");

    expect(response.body.order.paymentStatus).toBe("PENDING");

    console.log("COD order created:", codOrderId);
  });

  // =====================================================
  // 13. RESTAURANT CONFIRMS
  // =====================================================

  test("Restaurant confirms COD order", async () => {
    const response = await restaurantAgent
      .patch(`/api/orders/${codOrderId}/status`)
      .send({
        status: "CONFIRMED",
      });

    expect(response.statusCode).toBe(200);

    expect(response.body.order.status).toBe("CONFIRMED");

    console.log("Order confirmed");
  });

  // =====================================================
  // 14. RESTAURANT STARTS PREPARING
  // =====================================================

  test("Restaurant starts preparing", async () => {
    const response = await restaurantAgent
      .patch(`/api/orders/${codOrderId}/status`)
      .send({
        status: "PREPARING",
      });

    expect(response.statusCode).toBe(200);

    expect(response.body.order.status).toBe("PREPARING");

    console.log("Order preparing");
  });

  // =====================================================
  // 15. RESTAURANT MARKS READY
  // =====================================================

  test("Restaurant marks order READY", async () => {
    const response = await restaurantAgent
      .patch(`/api/orders/${codOrderId}/status`)
      .send({
        status: "READY",
      });

    expect(response.statusCode).toBe(200);

    expect(response.body.order.status).toBe("READY");

    expect(response.body.order.deliveryPartner).toBeDefined();

    console.log("Order ready and delivery partner assigned");
  });

  // =====================================================
  // 16. DELIVERY PARTNER GETS ORDERS
  // =====================================================

  test("Delivery partner gets assigned orders", async () => {
    const response = await deliveryAgent.get("/api/orders/delivery");

    expect(response.statusCode).toBe(200);

    expect(response.body.orders.length).toBeGreaterThan(0);

    console.log("Delivery partner received order");
  });

  // =====================================================
  // 17. PICK UP
  // =====================================================

  test("Delivery partner picks up order", async () => {
    const response = await deliveryAgent
      .patch(`/api/orders/${codOrderId}/status`)
      .send({
        status: "PICKED_UP",
      });

    expect(response.statusCode).toBe(200);

    expect(response.body.order.status).toBe("PICKED_UP");

    console.log("Order picked up");
  });

  // =====================================================
  // 18. OUT FOR DELIVERY
  // =====================================================

  test("Order goes out for delivery", async () => {
    const response = await deliveryAgent
      .patch(`/api/orders/${codOrderId}/status`)
      .send({
        status: "OUT_FOR_DELIVERY",
      });

    expect(response.statusCode).toBe(200);

    expect(response.body.order.status).toBe("OUT_FOR_DELIVERY");

    console.log("Order out for delivery");
  });

  // =====================================================
  // 19. DELIVERED
  // =====================================================

  test("Delivery partner delivers order", async () => {
    const response = await deliveryAgent
      .patch(`/api/orders/${codOrderId}/status`)
      .send({
        status: "DELIVERED",
      });

    expect(response.statusCode).toBe(200);

    expect(response.body.order.status).toBe("DELIVERED");

    console.log("Order delivered");
  });

  // =====================================================
  // 20. COMPLETE COD PAYMENT
  // =====================================================

  test("Complete COD payment", async () => {
    const response = await deliveryAgent
      .post("/api/payments/cod/complete")
      .send({
        orderId: codOrderId,
      });

    expect(response.statusCode).toBe(200);

    expect(response.body.paymentStatus).toBe("PAID");

    console.log("COD payment completed");
  });

  // =====================================================
  // 21. CREATE ONLINE ORDER
  // =====================================================

  test("Customer creates ONLINE order", async () => {
    const response = await customerAgent.post("/api/orders").send({
      restaurant: restaurantId,

      items: [
        {
          menuItem: menuItemId,
          quantity: 1,
        },
      ],

      deliveryAddress: {
        street: "MP Nagar",
        city: "Bhopal",
        state: "Madhya Pradesh",
        pincode: "462011",
      },

      paymentMethod: "ONLINE",
    });

    expect(response.statusCode).toBe(201);

    onlineOrderId = response.body.order._id;

    expect(onlineOrderId).toBeDefined();

    expect(response.body.order.paymentStatus).toBe("PENDING");

    console.log("Online order created:", onlineOrderId);
  });

  // =====================================================
  // 22. RESTAURANT CANNOT CONFIRM BEFORE PAYMENT
  // =====================================================

  test("Restaurant cannot confirm unpaid online order", async () => {
    const response = await restaurantAgent
      .patch(`/api/orders/${onlineOrderId}/status`)
      .send({
        status: "CONFIRMED",
      });

    expect(response.statusCode).toBe(400);

    expect(response.body.message).toBe("Online payment is pending");

    console.log("Unpaid online order correctly blocked");
  });

  // =====================================================
  // 23. PAY ONLINE
  // =====================================================

  test("Customer pays online", async () => {
    const response = await customerAgent.post("/api/payments/pay").send({
      orderId: onlineOrderId,
    });

    expect(response.statusCode).toBe(200);

    expect(response.body.paymentStatus).toBe("PAID");

    console.log("Online payment successful");
  });

  // =====================================================
  // 24. CANCEL ONLINE PAID ORDER
  // =====================================================

  test("Customer cancels paid online order", async () => {
    const response = await customerAgent
      .patch(`/api/orders/${onlineOrderId}/status`)
      .send({
        status: "CANCELLED",
      });

    expect(response.statusCode).toBe(200);

    expect(response.body.order.status).toBe("CANCELLED");

    expect(response.body.order.paymentStatus).toBe("REFUNDED");

    console.log("Online order cancelled and refunded");
  });

  // =====================================================
  // 25. CREATE ANOTHER COD ORDER FOR CANCELLATION
  // =====================================================

  let cancelCodOrderId;

  test("Create COD order for cancellation test", async () => {
    const response = await customerAgent.post("/api/orders").send({
      restaurant: restaurantId,

      items: [
        {
          menuItem: menuItemId,
          quantity: 1,
        },
      ],

      deliveryAddress: {
        street: "MP Nagar",
        city: "Bhopal",
        state: "Madhya Pradesh",
        pincode: "462011",
      },

      paymentMethod: "COD",
    });

    expect(response.statusCode).toBe(201);

    cancelCodOrderId = response.body.order._id;

    expect(response.body.order.status).toBe("PLACED");

    expect(response.body.order.paymentStatus).toBe("PENDING");
  });

  // =====================================================
  // 26. CANCEL UNPAID COD ORDER
  // =====================================================

  test("Customer cancels unpaid COD order", async () => {
    const response = await customerAgent
      .patch(`/api/orders/${cancelCodOrderId}/status`)
      .send({
        status: "CANCELLED",
      });

    expect(response.statusCode).toBe(200);

    expect(response.body.order.status).toBe("CANCELLED");

    expect(response.body.order.paymentStatus).toBe("PENDING");

    console.log("COD order cancelled without refund");
  });

  // =====================================================
  // 27. CLEAN CONNECTION
  // =====================================================

  afterAll(async () => {
    await mongoose.disconnect();

    console.log("Test database connection closed");
  });
});
