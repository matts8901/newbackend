const mongoose = require("mongoose");

// Define Project Schema
const SessionSchema = new mongoose.Schema(
  {
    session: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
    },
    otp: String,
    provider: {
      type: String,
      enum: ["github", "google", "email"],
    },
  },
  { timestamps: true }
);

// Create Model
const Sessions = mongoose.model("Session", SessionSchema);

module.exports = Sessions;
