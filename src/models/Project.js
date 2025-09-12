const mongoose = require("mongoose");
const crypto = require("crypto");

// Define Project Schema
const ProjectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    blocked: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubUser",
      },
    ],
    originalInput: {
      type: String,
    },
    //email and pass on sub project
    ep: {
      type: Boolean,
      default: true,
    },
    //email and otp on sub project
    eo: {
      type: Boolean,
      default: true,
    },
    memory: {
      type: String,
    },
    subusers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubUser",
      },
    ],
    subuserstotal: {
      type: Number,
      default: 0,
    },
    site_id: String,
    deployed_url: String,
    csslibrary: {
      type: String,
      required: true,
      trim: true,
    },
    framework: {
      type: String,
      required: true,
      trim: true,
    },
    generatedName: {
      type: String,
      default: () => crypto.randomBytes(8).toString("hex"),
      unique: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    url: {
      type: String,
    },
    lastResponder: { type: String, enum: ["user", "ai"] },
    isResponseCompleted: { type: Boolean, default: false },
    enh_prompt: String,
    images: [String],
    isPinned: { type: Boolean, default: false },
    isPublic: { type: Boolean, default: true },
    status: { type: String, default: "active", enum: ["active", "deleted"] },
  },
  { timestamps: true }
);

ProjectSchema.index({ generatedName: 1 }, { unique: true });

// Create Model
const Project = mongoose.model("Project", ProjectSchema);

module.exports = Project;
