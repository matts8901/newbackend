const mongoose = require("mongoose");

// Define Gallery Schema for storing images with labels
const GallerySchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      required: true,
      index: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    imageName: {
      type: String,
      required: true,
    },
    imageSize: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      required: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubUser",
      required: true,
    },
    tags: [String],
    description: {
      type: String,
      trim: true,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      default: "active",
      enum: ["active", "deleted"],
    },
  },
  { timestamps: true }
);

// Create indexes for better query performance
GallerySchema.index({ projectId: 1, label: 1 });
GallerySchema.index({ projectId: 1, status: 1 });
GallerySchema.index({ uploadedBy: 1 });

// Create Model
const Gallery = mongoose.model("Gallery", GallerySchema);

module.exports = Gallery;
