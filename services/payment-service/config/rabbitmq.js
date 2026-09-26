const amqp = require("amqplib");

const { processPayment } = require("../controllers/paymentController");

let channel;

const connectRabbitMQ = async () => {
  try {
    const connection = await amqp.connect("amqp://localhost:5672");

    channel = await connection.createChannel();

    await channel.assertQueue("payment_queue", {
      durable: true,
    });

    console.log("RabbitMQ connected");

    return channel;
  } catch (error) {
    console.error("RabbitMQ connection failed:", error.message);
    throw error;
  }
};

const getChannel = () => {
  if (!channel) {
    throw new Error("RabbitMQ channel not initialized");
  }

  return channel;
};

const consumePaymentEvents = async () => {
  const channel = getChannel();

  await channel.consume("payment_queue", async (message) => {
    if (!message) return;

    try {
      const orderData = JSON.parse(message.content.toString());

      console.log("OrderCreated event received:", orderData);

      await processPayment({
        order: orderData.orderId,
        customer: orderData.customer,
        amount: orderData.amount,
        paymentMethod: orderData.paymentMethod,
      });

      console.log("Payment processed successfully");

      channel.ack(message);
    } catch (error) {
      console.error("Error processing payment event:", error.message);

      channel.nack(message, false, true);
    }
  });

  console.log("Payment consumer started");
};

module.exports = {
  connectRabbitMQ,
  getChannel,
  consumePaymentEvents,
};
