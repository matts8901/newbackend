const mongoose = require("mongoose");

// Define User Schema
const UserSchema = new mongoose.Schema(
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
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
    },
    subscriptionIds: {
      type: [String],
      default: [],
    },
    isbuilding: { type: Boolean, default: false },
    plan: {
      type: String,
      default: "free",
      enum: ["free", "scale", "unlimited"],
    },
    claudeApiKey: String,
    pubId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    promptCount: { type: Number, default: 0 },
    unlimitedPromptCount: { type: Number, default: 0 },
    unlimitedPromptPacks: { type: Number, default: 0 },
    lastPromptReset: { type: Date, default: Date.now },
    subscriptionStatus: { type: String, default: "active" },
    subscriptionStartDate: { type: Date },
    subscriptionEndDate: { type: Date },
    Sessions: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
    },
    numberOfProjects: {
      type: Number,
      default: 0,
    },
    session: {
      type: String,
      default: null,
    },
    provider: {
      type: String,
      enum: ["github", "google", "email"],
    },
    projects: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project",
      },
    ],
    deployments: { type: Number, default: 0 },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Create Model
const User = mongoose.model("User", UserSchema);

module.exports = User;
