const amqp = require("amqplib");

const {
  findNearestAvailablePartner,
  assignPartner,
} = require("../controllers/deliveryPartnerController");

let channel;

const MAX_RETRIES = 5;
const RETRY_DELAY = 10000;

// =========================================
// Connect RabbitMQ
// =========================================

const connectRabbitMQ = async () => {
  try {
    const connection = await amqp.connect("amqp://localhost:5672");

    channel = await connection.createChannel();

    // =========================================
    // Main Exchange
    // =========================================

    await channel.assertExchange("food_delivery_events", "topic", {
      durable: true,
    });

    // =========================================
    // Dead Letter Exchange
    // =========================================

    await channel.assertExchange("food_delivery_dlx", "direct", {
      durable: true,
    });

    // =========================================
    // Dead Letter Queue
    // =========================================

    await channel.assertQueue("delivery_dead_letter_queue", {
      durable: true,
    });

    await channel.bindQueue(
      "delivery_dead_letter_queue",
      "food_delivery_dlx",
      "delivery.failed",
    );

    // =========================================
    // Retry Exchange
    // =========================================

    await channel.assertExchange("food_delivery_retry", "direct", {
      durable: true,
    });

    // =========================================
    // Retry Queue
    // =========================================

    await channel.assertQueue("delivery_retry_queue", {
      durable: true,
      arguments: {
        "x-message-ttl": RETRY_DELAY,
        "x-dead-letter-exchange": "food_delivery_events",
        "x-dead-letter-routing-key": "order.ready",
      },
    });

    await channel.bindQueue(
      "delivery_retry_queue",
      "food_delivery_retry",
      "delivery.retry",
    );

    // =========================================
    // Main Delivery Queue
    // =========================================

    await channel.assertQueue("delivery_queue", {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": "food_delivery_dlx",
        "x-dead-letter-routing-key": "delivery.failed",
      },
    });

    await channel.bindQueue(
      "delivery_queue",
      "food_delivery_events",
      "order.ready",
    );

    console.log("RabbitMQ connected");

    return channel;
  } catch (error) {
    console.error("RabbitMQ connection failed:", error.message);
    throw error;
  }
};

// =========================================
// Get Channel
// =========================================

const getChannel = () => {
  if (!channel) {
    throw new Error("RabbitMQ channel not initialized");
  }

  return channel;
};

// =========================================
// Consume Order Ready Events
// =========================================

const consumeOrderReadyEvents = async () => {
  const channel = getChannel();

  // Process only one unacknowledged message at a time
  await channel.prefetch(1);

  await channel.consume("delivery_queue", async (message) => {
    if (!message) return;

    try {
      const orderData = JSON.parse(message.content.toString());

      const retryCount = orderData.retryCount || 0;

      console.log("OrderReady event received:", orderData);

      console.log(`Delivery attempt: ${retryCount + 1}/${MAX_RETRIES}`);

      // =========================================
      // Find nearest available delivery partner
      // =========================================

      const result = await findNearestAvailablePartner(
        orderData.latitude,
        orderData.longitude,
      );

      console.log(
        "Nearest delivery partner:",
        result.partner._id,
        "Distance:",
        result.distanceInKm,
        "km",
      );

      // =========================================
      // Assign delivery partner using Redis lock
      // =========================================

      const deliveryPartner = await assignPartner(result.partner._id);

      console.log("Delivery partner assigned:", deliveryPartner._id);

      // =========================================
      // Publish delivery.assigned event
      // =========================================

      channel.publish(
        "food_delivery_events",
        "delivery.assigned",
        Buffer.from(
          JSON.stringify({
            orderId: orderData.orderId,
            deliveryPartnerId: deliveryPartner._id,
          }),
        ),
      );

      console.log("DeliveryAssigned event published");

      // =========================================
      // Successfully processed
      // =========================================

      channel.ack(message);
    } catch (error) {
      console.error("Error processing order.ready event:", error.message);

      let orderData;

      try {
        orderData = JSON.parse(message.content.toString());
      } catch (parseError) {
        console.error("Invalid message format. Sending directly to DLQ.");

        channel.nack(message, false, false);
        return;
      }

      const retryCount = orderData.retryCount || 0;

      // =========================================
      // Maximum retries reached
      // =========================================

      if (retryCount >= MAX_RETRIES - 1) {
        console.error(
          `Maximum retries (${MAX_RETRIES}) reached. Sending message to DLQ.`,
        );

        channel.publish(
          "food_delivery_dlx",
          "delivery.failed",
          Buffer.from(
            JSON.stringify({
              ...orderData,
              retryCount: retryCount,
              failureReason: error.message,
            }),
          ),
        );

        channel.ack(message);

        console.log("OrderReady event moved to Dead Letter Queue");

        return;
      }

      // =========================================
      // Retry
      // =========================================

      const retryMessage = {
        ...orderData,
        retryCount: retryCount + 1,
      };

      channel.publish(
        "food_delivery_retry",
        "delivery.retry",
        Buffer.from(JSON.stringify(retryMessage)),
      );

      channel.ack(message);

      console.log(
        `OrderReady event scheduled for retry ${retryCount + 1}/${MAX_RETRIES}`,
      );
    }
  });

  console.log("Delivery consumer started");
};

// =========================================
// Exports
// =========================================

module.exports = {
  connectRabbitMQ,
  getChannel,
  consumeOrderReadyEvents,
};
