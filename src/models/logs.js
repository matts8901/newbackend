const mongoose = require("mongoose");
const logsSchema = new mongoose.Schema(
  {
    log: {
      type: String,
    },
    projectId: {
      type: String,
    },
  },
  { timestamps: true }
);
const Logs = mongoose.model("Logs", logsSchema);
module.exports = Logs;
