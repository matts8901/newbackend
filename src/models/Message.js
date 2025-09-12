const mongoose = require("mongoose");

// Define Project Schema
const MessageSchema = new mongoose.Schema(
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
  },
  { timestamps: true }
);

// Create Model
const Message = mongoose.model("message", MessageSchema);

module.exports = Message;
