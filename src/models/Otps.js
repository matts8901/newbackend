const mongoose = require("mongoose");

// Define Project Schema
const OtpSchema = new mongoose.Schema(
  {
    otp: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Create Model
const Otps = mongoose.model("Otps", OtpSchema);

module.exports = Otps;
