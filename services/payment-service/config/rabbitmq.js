const amqp = require("amqplib");

const { processPayment } = require("../controllers/paymentController");
const ProcessedEvent = require("../models/processedEventModel");

let channel;

const EXCHANGE = "food_delivery_events";

const PAYMENT_QUEUE = "payment_queue";
const RETRY_QUEUE = "payment_retry_queue";
const DLQ_QUEUE = "payment_dlq";

const connectRabbitMQ = async () => {
  try {
    const connection = await amqp.connect(
      process.env.RABBITMQ_URL || "amqp://localhost:5672",
    );

    channel = await connection.createChannel();

    // --------------------------------------------------
    // 1. Exchange
    // --------------------------------------------------

    await channel.assertExchange(EXCHANGE, "topic", {
      durable: true,
    });

    // --------------------------------------------------
    // 2. Main Payment Queue
    // --------------------------------------------------

    await channel.assertQueue(PAYMENT_QUEUE, {
      durable: true,
    });

    // --------------------------------------------------
    // 3. Retry Queue
    // --------------------------------------------------

    await channel.assertQueue(RETRY_QUEUE, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": EXCHANGE,
        "x-dead-letter-routing-key": "payment.retry",
        "x-message-ttl": 5000,
      },
    });

    // --------------------------------------------------
    // 4. Dead Letter Queue
    // --------------------------------------------------

    await channel.assertQueue(DLQ_QUEUE, {
      durable: true,
    });

    // --------------------------------------------------
    // 5. Bind Retry Queue -> Payment Queue
    // --------------------------------------------------

    await channel.bindQueue(PAYMENT_QUEUE, EXCHANGE, "payment.retry");

    // --------------------------------------------------
    // 6. Bind DLQ
    // --------------------------------------------------

    await channel.bindQueue(DLQ_QUEUE, EXCHANGE, "payment.dlq");

    console.log("RabbitMQ connected");

    return channel;
  } catch (error) {
    console.error("RabbitMQ connection failed:", error.message);

    throw error;
  }
};

// --------------------------------------------------
// Get RabbitMQ Channel
// --------------------------------------------------

const getChannel = () => {
  if (!channel) {
    throw new Error("RabbitMQ channel not initialized");
  }

  return channel;
};

// --------------------------------------------------
// Payment Event Consumer
// --------------------------------------------------

const consumePaymentEvents = async () => {
  const channel = getChannel();

  await channel.consume(PAYMENT_QUEUE, async (message) => {
    if (!message) return;

    try {
      // --------------------------------------------
      // 1. Parse event
      // --------------------------------------------

      const orderData = JSON.parse(message.content.toString());

      console.log("OrderCreated event received:", orderData);

      // --------------------------------------------
      // 2. Check idempotency
      // --------------------------------------------

      const alreadyProcessed = await ProcessedEvent.findOne({
        eventId: orderData.eventId,
      });

      if (alreadyProcessed) {
        console.log(`Duplicate event ignored: ${orderData.eventId}`);

        channel.ack(message);

        return;
      }

      // --------------------------------------------
      // 3. Process payment
      // --------------------------------------------

      await processPayment({
        order: orderData.orderId,
        customer: orderData.customer,
        amount: orderData.amount,
        paymentMethod: orderData.paymentMethod,
      });

      // --------------------------------------------
      // 4. Record successful processing
      // --------------------------------------------

      await ProcessedEvent.create({
        eventId: orderData.eventId,
        eventType: orderData.eventType,
      });

      console.log(`Event processed and recorded: ${orderData.eventId}`);

      // --------------------------------------------
      // 5. Acknowledge successful message
      // --------------------------------------------

      channel.ack(message);
    } catch (error) {
      console.error("Error processing payment event:", error.message);

      // --------------------------------------------
      // 6. Get retry count
      // --------------------------------------------

      const retryCount = message.properties.headers?.["x-retry-count"] || 0;

      console.log(`Payment processing failed. Retry count: ${retryCount}`);

      // --------------------------------------------
      // 7. Retry if retry count < 3
      // --------------------------------------------

      if (retryCount < 3) {
        channel.publish(EXCHANGE, "payment.retry", message.content, {
          persistent: true,

          headers: {
            "x-retry-count": retryCount + 1,
          },
        });

        console.log(`Message sent to retry queue. Attempt: ${retryCount + 1}`);
      } else {
        // ------------------------------------------
        // 8. Maximum retries reached -> DLQ
        // ------------------------------------------

        channel.publish(EXCHANGE, "payment.dlq", message.content, {
          persistent: true,

          headers: {
            "x-retry-count": retryCount,
          },
        });

        console.log("Maximum retries reached. Message sent to DLQ.");
      }

      // --------------------------------------------
      // 9. Remove original message
      // --------------------------------------------

      channel.ack(message);
    }
  });

  console.log("Payment consumer started");
};

// --------------------------------------------------
// Exports
// --------------------------------------------------

module.exports = {
  connectRabbitMQ,
  getChannel,
  consumePaymentEvents,
};
