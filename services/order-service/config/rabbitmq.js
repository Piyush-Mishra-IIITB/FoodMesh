const amqp = require("amqplib");

const Order = require("../models/orderModel");

let channel;

const connectRabbitMQ = async () => {
  try {
    const connection = await amqp.connect("amqp://localhost:5672");

    // Create Confirm Channel
    channel = await connection.createConfirmChannel();

    // =========================================
    // Main Exchange
    // =========================================

    await channel.assertExchange("food_delivery_events", "topic", {
      durable: true,
    });

    // =========================================
    // Payment Queue
    // =========================================

    await channel.assertQueue("payment_queue", {
      durable: true,
    });

    await channel.bindQueue(
      "payment_queue",
      "food_delivery_events",
      "order.created",
    );

    // =========================================
    // Delivery Assignment Queue
    // =========================================

    await channel.assertQueue("order_delivery_queue", {
      durable: true,
    });

    await channel.bindQueue(
      "order_delivery_queue",
      "food_delivery_events",
      "delivery.assigned",
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
// Consume Delivery Assigned Events
// =========================================

const consumeDeliveryAssignedEvents = async () => {
  const channel = getChannel();

  await channel.consume("order_delivery_queue", async (message) => {
    if (!message) return;

    try {
      const eventData = JSON.parse(message.content.toString());

      console.log("DeliveryAssigned event received:", eventData);

      const order = await Order.findById(eventData.orderId);

      if (!order) {
        throw new Error(`Order not found: ${eventData.orderId}`);
      }

      order.deliveryPartner = eventData.deliveryPartnerId;

      await order.save();

      console.log(
        "Delivery partner added to order:",
        eventData.deliveryPartnerId,
      );

      channel.ack(message);
    } catch (error) {
      console.error("Error processing delivery.assigned event:", error.message);

      channel.nack(message, false, true);
    }
  });

  console.log("Delivery assignment consumer started");
};

// =========================================
// Exports
// =========================================

module.exports = {
  connectRabbitMQ,
  getChannel,
  consumeDeliveryAssignedEvents,
};
