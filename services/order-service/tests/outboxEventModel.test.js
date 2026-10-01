const OutboxEvent = require("../models/outboxEventModel");

const createValidEvent = (overrides = {}) => {
  return new OutboxEvent({
    eventType: "ORDER_CREATED",
    exchange: "food_delivery_events",
    routingKey: "order.created",
    payload: {
      orderId: "650000000000000000000001",
    },
    ...overrides,
  });
};

describe("OutboxEvent Model Tests", () => {
  test("should create an event with valid data", async () => {
    const event = createValidEvent();

    await expect(event.validate()).resolves.toBeUndefined();
  });

  test("should reject an event without eventType", async () => {
    const event = createValidEvent({ eventType: undefined });

    await expect(event.validate()).rejects.toThrow("eventType");
  });

  test("should reject an event without exchange", async () => {
    const event = createValidEvent({ exchange: undefined });

    await expect(event.validate()).rejects.toThrow("exchange");
  });

  test("should reject an event without routingKey", async () => {
    const event = createValidEvent({ routingKey: undefined });

    await expect(event.validate()).rejects.toThrow("routingKey");
  });

  test("should reject an event without payload", async () => {
    const event = createValidEvent({ payload: undefined });

    await expect(event.validate()).rejects.toThrow("payload");
  });

  test("should reject an event with invalid status", async () => {
    const event = createValidEvent({ status: "INVALID" });

    await expect(event.validate()).rejects.toThrow("is not a valid enum value");
  });

  test("should apply default values correctly", () => {
    const event = createValidEvent();

    expect(event.status).toBe("PENDING");
    expect(event.attempts).toBe(0);
    expect(event.lastError).toBeNull();
    expect(event.publishedAt).toBeNull();
  });
});
