const mongoose = require("mongoose");
const CodeSchema = new mongoose.Schema(
  {
    user: {
      type: String,
    },
    projectId: {
      type: String,
    },
    files: [
      {
        file: String,
        code: String,
      },
    ],
  },
  { timestamps: true }
);
const Code = mongoose.model("Code", CodeSchema);
module.exports = Code;
