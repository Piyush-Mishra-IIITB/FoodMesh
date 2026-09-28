const OutboxEvent = require("./models/outboxEventModel");
const { getChannel } = require("./config/rabbitmq");

let isPublishing = false;

const publishPendingEvents = async () => {
  // Prevent overlapping publisher runs
  if (isPublishing) {
    return;
  }

  isPublishing = true;

  try {
    const events = await OutboxEvent.find({
      status: "PENDING",
    })
      .sort({ createdAt: 1 })
      .limit(10);

    if (events.length === 0) {
      return;
    }

    const channel = getChannel();

    for (const event of events) {
      try {
        event.attempts += 1;

        const eventMessage = {
          eventId: event._id.toString(),
          eventType: event.eventType,
          ...event.payload,
        };

        channel.publish(
          event.exchange,
          event.routingKey,
          Buffer.from(JSON.stringify(eventMessage)),
          {
            persistent: true,
          },
        );

        await channel.waitForConfirms();

        event.status = "PUBLISHED";
        event.publishedAt = new Date();
        event.lastError = null;

        await event.save();

        console.log(
          `Outbox event published: ${event.eventType} | ${event._id}`,
        );
      } catch (error) {
        event.status = "PENDING";
        event.lastError = error.message;

        await event.save();

        console.error(
          `Failed to publish outbox event ${event._id}:`,
          error.message,
        );
      }
    }
  } catch (error) {
    console.error("Outbox publisher error:", error.message);
  } finally {
    isPublishing = false;
  }
};

const startOutboxPublisher = () => {
  console.log("Outbox Publisher started");

  setInterval(publishPendingEvents, 5000);
};

module.exports = startOutboxPublisher;
