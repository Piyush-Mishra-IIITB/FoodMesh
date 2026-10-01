jest.mock("../models/outboxEventModel", () => ({
  find: jest.fn(),
}));

jest.mock("../config/rabbitmq", () => ({
  getChannel: jest.fn(),
}));

const OutboxEvent = require("../models/outboxEventModel");
const { getChannel } = require("../config/rabbitmq");
const startOutboxPublisher = require("../outboxPublisher");

let publisherCallback;

const createEvent = (overrides = {}) => ({
  _id: {
    toString: () => "507f1f77bcf86cd799439011",
  },
  eventType: "order.created",
  exchange: "food_delivery_events",
  routingKey: "order.created",
  payload: {
    orderId: "order123",
    customerId: "customer123",
  },
  status: "PENDING",
  attempts: 0,
  publishedAt: null,
  lastError: null,
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const createQuery = (events) => ({
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue(events),
});

describe("Outbox Publisher Tests", () => {
  let channel;

  beforeEach(() => {
    jest.clearAllMocks();

    publisherCallback = null;

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});

    jest.spyOn(global, "setInterval").mockImplementation((callback, delay) => {
      publisherCallback = callback;
      return 123;
    });

    channel = {
      publish: jest.fn(),
      waitForConfirms: jest.fn().mockResolvedValue(true),
    };

    getChannel.mockReturnValue(channel);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const startPublisher = () => {
    startOutboxPublisher();

    expect(publisherCallback).toBeDefined();

    return publisherCallback;
  };

  test("should start publisher with a 5-second interval", () => {
    startOutboxPublisher();

    expect(setInterval).toHaveBeenCalledTimes(1);
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
  });

  test("should fetch only pending events, sorted by creation date and limited to 10", async () => {
    const query = createQuery([]);

    OutboxEvent.find.mockReturnValue(query);

    const runPublisher = startPublisher();

    await runPublisher();

    expect(OutboxEvent.find).toHaveBeenCalledWith({
      status: "PENDING",
    });

    expect(query.sort).toHaveBeenCalledWith({
      createdAt: 1,
    });

    expect(query.limit).toHaveBeenCalledWith(10);
  });

  test("should not access RabbitMQ when there are no pending events", async () => {
    OutboxEvent.find.mockReturnValue(createQuery([]));

    const runPublisher = startPublisher();

    await runPublisher();

    expect(getChannel).not.toHaveBeenCalled();
    expect(channel.publish).not.toHaveBeenCalled();
  });

  test("should publish a pending event with the correct message", async () => {
    const event = createEvent();

    OutboxEvent.find.mockReturnValue(createQuery([event]));

    const runPublisher = startPublisher();

    await runPublisher();

    expect(channel.publish).toHaveBeenCalledTimes(1);

    const [exchange, routingKey, message, options] =
      channel.publish.mock.calls[0];

    expect(exchange).toBe("food_delivery_events");
    expect(routingKey).toBe("order.created");

    expect(JSON.parse(message.toString())).toEqual({
      eventId: "507f1f77bcf86cd799439011",
      eventType: "order.created",
      orderId: "order123",
      customerId: "customer123",
    });

    expect(options).toEqual({
      persistent: true,
    });
  });

  test("should mark event as PUBLISHED after RabbitMQ confirmation", async () => {
    const event = createEvent();

    OutboxEvent.find.mockReturnValue(createQuery([event]));

    const runPublisher = startPublisher();

    await runPublisher();

    expect(channel.waitForConfirms).toHaveBeenCalledTimes(1);

    expect(event.attempts).toBe(1);
    expect(event.status).toBe("PUBLISHED");
    expect(event.publishedAt).toBeInstanceOf(Date);
    expect(event.lastError).toBeNull();

    expect(event.save).toHaveBeenCalledTimes(1);
  });

  test("should keep event PENDING when RabbitMQ publishing fails", async () => {
    const event = createEvent();

    channel.waitForConfirms.mockRejectedValueOnce(
      new Error("RabbitMQ confirmation failed"),
    );

    OutboxEvent.find.mockReturnValue(createQuery([event]));

    const runPublisher = startPublisher();

    await runPublisher();

    expect(event.attempts).toBe(1);
    expect(event.status).toBe("PENDING");
    expect(event.lastError).toBe("RabbitMQ confirmation failed");

    expect(event.save).toHaveBeenCalledTimes(1);
  });

  test("should continue publishing remaining events if one event fails", async () => {
    const firstEvent = createEvent({
      _id: {
        toString: () => "event1",
      },
    });

    const secondEvent = createEvent({
      _id: {
        toString: () => "event2",
      },
    });

    channel.waitForConfirms
      .mockRejectedValueOnce(new Error("First event failed"))
      .mockResolvedValueOnce(true);

    OutboxEvent.find.mockReturnValue(createQuery([firstEvent, secondEvent]));

    const runPublisher = startPublisher();

    await runPublisher();

    expect(channel.publish).toHaveBeenCalledTimes(2);

    expect(firstEvent.status).toBe("PENDING");
    expect(firstEvent.lastError).toBe("First event failed");

    expect(secondEvent.status).toBe("PUBLISHED");
    expect(secondEvent.lastError).toBeNull();
  });

  test("should prevent overlapping publisher runs", async () => {
    let resolveQuery;

    const pendingQuery = new Promise((resolve) => {
      resolveQuery = resolve;
    });

    const query = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnValue(pendingQuery),
    };

    OutboxEvent.find.mockReturnValue(query);

    const runPublisher = startPublisher();

    const firstRun = runPublisher();

    // The first run is still waiting for the database query.
    await runPublisher();

    // The second run should return without making another query.
    expect(OutboxEvent.find).toHaveBeenCalledTimes(1);

    resolveQuery([]);

    await firstRun;

    // The publisher should be available again after completion.
    OutboxEvent.find.mockReturnValue(createQuery([]));

    await runPublisher();

    expect(OutboxEvent.find).toHaveBeenCalledTimes(2);
  });

  test("should handle errors while fetching pending events", async () => {
    OutboxEvent.find.mockImplementation(() => {
      throw new Error("Database query failed");
    });

    const runPublisher = startPublisher();

    await expect(runPublisher()).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(
      "Outbox publisher error:",
      "Database query failed",
    );

    expect(getChannel).not.toHaveBeenCalled();
  });

  test("should handle RabbitMQ channel connection errors", async () => {
    const event = createEvent();

    OutboxEvent.find.mockReturnValue(createQuery([event]));

    getChannel.mockImplementation(() => {
      throw new Error("RabbitMQ channel unavailable");
    });

    const runPublisher = startPublisher();

    await expect(runPublisher()).resolves.toBeUndefined();

    expect(event.save).not.toHaveBeenCalled();

    expect(console.error).toHaveBeenCalledWith(
      "Outbox publisher error:",
      "RabbitMQ channel unavailable",
    );
  });
});
