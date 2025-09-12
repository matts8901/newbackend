const mongoose = require("mongoose");

// Define Project Schema
const PlanSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["ai", "user"],
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },
    images: [String],
    ImagetoClone: String,
  },
  { timestamps: true }
);

// Create Model
const Plan = mongoose.model("plan", PlanSchema);

module.exports = Plan;
