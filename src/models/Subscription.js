const mongoose = require("mongoose");

// Define Subscription Schema
const SubscriptionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    subscriptionId: {
      type: String,
      unique: true,
      sparse: true, // Allows multiple null values
    },
    plan: {
      type: String,
      default: "free",
      enum: ["free", "scale", "unlimited"],
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: ["created", "failed", "pending", "active", "inactive"],
    },
  },
  { timestamps: true }
);

// Create Model
const Subscription = mongoose.model("Subscription", SubscriptionSchema);

module.exports = Subscription;
