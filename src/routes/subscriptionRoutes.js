const express = require("express");
const router = express.Router();
const {
  upgradePlan,
  downgradeToFree,
  getSubscriptionStatus,
  createSubscription,
  updateSubscriptionStatus,
  handleWebhook,
} = require("../controllers/subscriptionController");

// Subscription routes
router.post("/webhook-sub", handleWebhook);
router.post("/create-sub", createSubscription);
router.post("/update-sub", updateSubscriptionStatus);

router.post("/upgrade", upgradePlan);
router.post("/downgrade", downgradeToFree);
router.post("/sub-status", getSubscriptionStatus);

module.exports = router;
