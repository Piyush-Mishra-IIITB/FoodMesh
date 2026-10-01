const Order = require("../models/orderModel");

describe("Order Model Tests", () => {
  // 1. Valid order
  test("should create an order with valid data", async () => {
    const order = new Order({
      customer: "650000000000000000000001",
      restaurant: "650000000000000000000002",

      items: [
        {
          menuItem: "650000000000000000000003",
          name: "Pizza",
          quantity: 2,
          price: 200,
        },
      ],

      deliveryAddress: {
        street: "MP Nagar",
        city: "Bhopal",
        state: "Madhya Pradesh",
        pincode: "462011",
      },

      totalAmount: 400,
      paymentMethod: "ONLINE",
    });

    await expect(order.validate()).resolves.toBeUndefined();

    expect(order.status).toBe("PLACED");
    expect(order.paymentStatus).toBe("PENDING");
    expect(order.deliveryPartner).toBeNull();
  });

  // 2. Missing customer
  test("should reject an order without customer", async () => {
    const order = new Order({
      restaurant: "650000000000000000000002",

      items: [
        {
          menuItem: "650000000000000000000003",
          name: "Pizza",
          quantity: 2,
          price: 200,
        },
      ],

      deliveryAddress: {
        street: "MP Nagar",
        city: "Bhopal",
        state: "Madhya Pradesh",
        pincode: "462011",
      },

      totalAmount: 400,
      paymentMethod: "ONLINE",
    });

    await expect(order.validate()).rejects.toThrow("customer");
  });

  // 3. Missing restaurant
  test("should reject an order without restaurant", async () => {
    const order = new Order({
      customer: "650000000000000000000001",

      items: [
        {
          menuItem: "650000000000000000000003",
          name: "Pizza",
          quantity: 2,
          price: 200,
        },
      ],

      deliveryAddress: {
        street: "MP Nagar",
        city: "Bhopal",
        state: "Madhya Pradesh",
        pincode: "462011",
      },

      totalAmount: 400,
      paymentMethod: "ONLINE",
    });

    await expect(order.validate()).rejects.toThrow("restaurant");
  });

  // 4. Quantity zero
  test("should reject an order with quantity zero", async () => {
    const order = new Order({
      customer: "650000000000000000000001",
      restaurant: "650000000000000000000002",

      items: [
        {
          menuItem: "650000000000000000000003",
          name: "Pizza",
          quantity: 0,
          price: 200,
        },
      ],

      deliveryAddress: {
        street: "MP Nagar",
        city: "Bhopal",
        state: "Madhya Pradesh",
        pincode: "462011",
      },

      totalAmount: 200,
      paymentMethod: "ONLINE",
    });

    await expect(order.validate()).rejects.toThrow("minimum allowed value");
  });

  // 5. Negative price
  test("should reject an order with negative item price", async () => {
    const order = new Order({
      customer: "650000000000000000000001",
      restaurant: "650000000000000000000002",

      items: [
        {
          menuItem: "650000000000000000000003",
          name: "Pizza",
          quantity: 1,
          price: -100,
        },
      ],

      deliveryAddress: {
        street: "MP Nagar",
        city: "Bhopal",
        state: "Madhya Pradesh",
        pincode: "462011",
      },

      totalAmount: 100,
      paymentMethod: "ONLINE",
    });

    await expect(order.validate()).rejects.toThrow("minimum allowed value");
  });

  // 6. Invalid payment method
  test("should reject an invalid payment method", async () => {
    const order = new Order({
      customer: "650000000000000000000001",
      restaurant: "650000000000000000000002",

      items: [
        {
          menuItem: "650000000000000000000003",
          name: "Pizza",
          quantity: 1,
          price: 200,
        },
      ],

      deliveryAddress: {
        street: "MP Nagar",
        city: "Bhopal",
        state: "Madhya Pradesh",
        pincode: "462011",
      },

      totalAmount: 200,
      paymentMethod: "UPI",
    });

    await expect(order.validate()).rejects.toThrow("is not a valid enum value");
  });

  // 7. Invalid order status
  test("should reject an invalid order status", async () => {
    const order = new Order({
      customer: "650000000000000000000001",
      restaurant: "650000000000000000000002",

      items: [
        {
          menuItem: "650000000000000000000003",
          name: "Pizza",
          quantity: 1,
          price: 200,
        },
      ],

      deliveryAddress: {
        street: "MP Nagar",
        city: "Bhopal",
        state: "Madhya Pradesh",
        pincode: "462011",
      },

      totalAmount: 200,
      paymentMethod: "COD",
      status: "PROCESSING",
    });

    await expect(order.validate()).rejects.toThrow("is not a valid enum value");
  });

  // 8. Missing delivery address
  test("should reject an order without required delivery address fields", async () => {
    const order = new Order({
      customer: "650000000000000000000001",
      restaurant: "650000000000000000000002",

      items: [
        {
          menuItem: "650000000000000000000003",
          name: "Pizza",
          quantity: 1,
          price: 200,
        },
      ],

      deliveryAddress: {
        city: "Bhopal",
        state: "Madhya Pradesh",
        pincode: "462011",
      },

      totalAmount: 200,
      paymentMethod: "COD",
    });

    await expect(order.validate()).rejects.toThrow("street");
  });

  // 9. Missing payment method
  test("should reject an order without payment method", async () => {
    const order = new Order({
      customer: "650000000000000000000001",
      restaurant: "650000000000000000000002",

      items: [
        {
          menuItem: "650000000000000000000003",
          name: "Pizza",
          quantity: 1,
          price: 200,
        },
      ],

      deliveryAddress: {
        street: "MP Nagar",
        city: "Bhopal",
        state: "Madhya Pradesh",
        pincode: "462011",
      },

      totalAmount: 200,
    });

    await expect(order.validate()).rejects.toThrow("paymentMethod");
  });
});
