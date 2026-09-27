const mongoose = require("mongoose");

const outboxEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
    },

    exchange: {
      type: String,
      required: true,
    },

    routingKey: {
      type: String,
      required: true,
    },

    payload: {
      type: Object,
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "PUBLISHED", "FAILED"],
      default: "PENDING",
    },

    attempts: {
      type: Number,
      default: 0,
    },

    lastError: {
      type: String,
      default: null,
    },

    publishedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

outboxEventSchema.index({
  status: 1,
  createdAt: 1,
});

module.exports = mongoose.model("OutboxEvent", outboxEventSchema);
