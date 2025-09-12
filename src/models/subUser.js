const mongoose = require("mongoose");

// Define SubUser Schema
const SubUserSchema = new mongoose.Schema(
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
    password: {
      type: String,
    },
    status: { type: String, default: "active" },
    otp: Number,
    projectId: {
      type: "String",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Create Model
const SubUser = mongoose.model("SubUser", SubUserSchema);

module.exports = SubUser;
