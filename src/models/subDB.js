const mongoose = require("mongoose");

// Define Project Schema
const SubDB = new mongoose.Schema(
  {
    projectId: {
      type: String,
    },
    type: {
      type: String,
    },
    data: {
      type: String,
    },
  },
  { timestamps: true }
);

// Create Model
const SubDatabase = mongoose.model("SubDB", SubDB);

module.exports = SubDatabase;
