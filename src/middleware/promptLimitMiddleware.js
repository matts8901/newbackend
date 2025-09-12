const User = require("../models/User");

const checkPromptLimit = async (req, res, next) => {
  try {
    const { owner } = req.body;

    if (!owner) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email: owner });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check prompt limits based on plan using UTC time
    const now = new Date();
    const lastReset = new Date(user.lastPromptReset);

    // Get UTC month and year
    const currentUTCMonth = now.getUTCMonth();
    const currentUTCYear = now.getUTCFullYear();
    const lastResetUTCMonth = lastReset.getUTCMonth();
    const lastResetUTCYear = lastReset.getUTCFullYear();

    // Reset prompt count if it's a new month in UTC
    if (
      currentUTCMonth !== lastResetUTCMonth ||
      currentUTCYear !== lastResetUTCYear
    ) {
      user.promptCount = user.plan === "free" ? 5 : 200;
      user.lastPromptReset = now;
      await user.save();
    }

    // let promptLimit = user.plan === "scale" ? user.promptCount : 5;
    // let message =
    //   "You have reached your monthly limit of 5 prompts. Upgrade to Scale plan for 200 prompts.";

    // if (user.plan === "scale") {
    //   if (user.promptCount <= 0) {
    //     message =
    //       "You have reached your prompt limit. Purchase an extension pack for $15/200 prompts.";
    //     return res.status(403).json({ success: false, message });
    //   }
    //   user.promptCount -= 1;
    // } else {
    //   if (user.promptCount >= promptLimit) {
    //     return res.status(403).json({ success: false, message });
    //   }
    //   user.promptCount -= 1;
    // }

    // await user.save();

    next();
  } catch (error) {
    console.error("Prompt Limit Check Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while checking prompt limits.",
    });
  }
};

module.exports = { checkPromptLimit };
