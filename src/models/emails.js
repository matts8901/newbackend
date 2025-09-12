const mongoose = require("mongoose");

// Define Mails Schema
const MailsSchema = new mongoose.Schema(
  {
    // Email Content
    subject: {
      type: String,
      required: true,
    },

    htmlContent: {
      type: String,
      required: true,
    },

    textContent: {
      type: String,
    },

    // Recipients
    to: [
      {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
      },
    ],

    cc: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],

    bcc: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],

    // Sender Information
    from: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    fromName: {
      type: String,
      trim: true,
    },

    replyTo: {
      type: String,
      trim: true,
      lowercase: true,
    },

    // Attachments as array of strings (URLs or file paths)
    attachments: [
      {
        type: String,
        trim: true,
      },
    ],

    // Email Status and Tracking
    status: {
      type: String,
      enum: ["pending", "sent", "delivered", "failed", "bounced"],
      default: "pending",
    },

    // External Email Service Data
    emailServiceId: {
      type: String, // Resend email ID or other service ID
      trim: true,
    },

    emailService: {
      type: String,
      enum: ["resend", "sendgrid", "mailgun", "ses", "other"],
      default: "resend",
    },

    // Email Priority
    priority: {
      type: String,
      enum: ["low", "normal", "high"],
      default: "normal",
    },

    // Email Category/Type
    category: {
      type: String,
      trim: true,
    },

    tags: [
      {
        type: String,
        trim: true,
      },
    ],

    // Scheduling
    scheduledAt: {
      type: Date,
    },

    sentAt: {
      type: Date,
    },

    deliveredAt: {
      type: Date,
    },

    // Error Information
    errorMessage: {
      type: String,
      trim: true,
    },

    retryCount: {
      type: Number,
      default: 0,
    },

    // Template Information
    templateId: {
      type: String,
      trim: true,
    },

    templateData: {
      type: mongoose.Schema.Types.Mixed, // For dynamic template variables
    },

    // User/Campaign Association
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
    },

    // Tracking and Analytics
    opened: {
      type: Boolean,
      default: false,
    },

    openedAt: {
      type: Date,
    },

    clicked: {
      type: Boolean,
      default: false,
    },

    clickedAt: {
      type: Date,
    },

    unsubscribed: {
      type: Boolean,
      default: false,
    },

    unsubscribedAt: {
      type: Date,
    },

    // Additional Metadata
    ipAddress: {
      type: String,
      trim: true,
    },

    userAgent: {
      type: String,
      trim: true,
    },

    source: {
      type: String,
      trim: true,
    },

    notes: {
      type: String,
      trim: true,
    },

    // Soft Delete
    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    // Add indexes for better query performance
    indexes: [
      { to: 1 },
      { from: 1 },
      { status: 1 },
      { sentAt: -1 },
      { userId: 1 },
      { campaignId: 1 },
      { createdAt: -1 },
    ],
  }
);

// Add compound indexes
MailsSchema.index({ userId: 1, createdAt: -1 });
MailsSchema.index({ status: 1, scheduledAt: 1 });
MailsSchema.index({ campaignId: 1, status: 1 });

const Mails = mongoose.model("Mails", MailsSchema);
module.exports = Mails;
