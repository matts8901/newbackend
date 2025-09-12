const mongoose = require("mongoose");

// Define Project Schema
const BetaSchema = new mongoose.Schema(
  {
    name: {
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
const Beta = mongoose.model("BetaAccess", BetaSchema);

module.exports = Beta;
