const User = require("../models/User");
const Otps = require("../models/Otps");
const Session = require("../models/Session");
const { ResendEmail } = require("../helpers/Resend");

// Login controller
exports.emaillogin = async (req, res) => {
  try {
    const { email } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email are required",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const newOtp = new Otps({ otp, email });
    await newOtp.save();

    await ResendEmail({
      from: "no-reply@mallow.dev",
      to: email,
      subject: `Hey, your otp for mallow!`,
      html: `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            background-color: #141414;
            color: #ffffff;
            font-family: 'Helvetica', 'Arial', sans-serif;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 620px;
            margin: 30px auto;
            padding: 35px;
            background-color: #141414;
            border-radius: 12px;
            border: 1px solid #2a2a2a;
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4);
          }
          .header {
            font-size: 28px;
            color: #ffffff;
            margin: 0 0 25px;
            font-weight: 300;
            letter-spacing: 0.5px;
          }
          p {
            font-size: 16px;
            line-height: 1.7;
            color: #ffffff;
            margin: 0 0 20px;
          }
          .highlight {
            color: #ffffff;
            font-weight: bold;
            background: rgba(255, 255, 255, 0.1);
            padding: 3px 10px;
            border-radius: 5px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
          }
          .otp-box {
            font-size: 24px;
            font-weight: bold;
            color: #ffffff;
            background: rgba(255, 255, 255, 0.1);
            padding: 10px 20px;
            border-radius: 8px;
            display: inline-block;
            margin: 15px 0;
            letter-spacing: 2px;
          }
          .team {
            font-style: italic;
            color: #e0e0e0;
            font-size: 15px;
          }
          .divider {
            width: 50px;
            height: 2px;
            background-color: #ffffff;
            opacity: 0.2;
            margin: 25px auto;
          }
          .footer {
            font-size: 13px;
            color: #bbbbbb;
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #2a2a2a;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <p>Hey, here is your Otp for Company verification:</p>
          <div class="otp-box">${otp}</div>
          <p>This OTP is valid for the next <strong>10 minutes</strong>.</p>
          <div class="footer">
            © 2025 Company.
          </div>
        </div>
      </body>
      </html>`,
    });

    // Send response
    res.json({
      success: true,
      message: "successful",
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

exports.verify = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email are required",
      });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    const checkOtp = await Otps.findOne({
      email: email.trim(),
      otp: String(otp).trim(),
    });

    if (checkOtp.email !== email) {
      return res.status(400).json({
        success: false,
        message: "Invalid email!",
      });
    }

    if (!checkOtp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    const otpAge = (Date.now() - new Date(checkOtp.createdAt)) / (1000 * 60); // Convert to minutes
    if (otpAge > 10) {
      return res.status(400).json({
        success: false,
        message: "OTP expired. Request a new one.",
      });
    }

    if (String(otp).trim().length !== 6) {
      return res.status(400).json({
        success: false,
        message: "OTP must be 6 digits",
      });
    }
    // Find user by email
    let user = await User.findOne({ email: email.trim() });

    if (!user) {
      // Generate a unique 6-digit pubId
      let pubId;
      let isUnique = false;

      while (!isUnique) {
        // Generate a random 6-digit number
        pubId = Math.floor(100000 + Math.random() * 900000).toString();

        // Check if this pubId already exists
        const existingUser = await User.findOne({ pubId });
        if (!existingUser) {
          isUnique = true;
        }
      }

      const newUser = User({
        email: email.trim(),
        pubId: pubId,
        promptCount: 5,
      });

      await newUser.save();
      user = newUser;
    }

    const sessionId = Math.floor(1000000000000 + Math.random() * 9000000000000);

    const newSession = new Session({
      session: sessionId,
      email: email.trim(),
      provider: "email",
    });

    await newSession.save();

    // update user with session id
    await User.findOneAndUpdate(
      { email: email.trim() },
      { $set: { sessionId, provider: "email" } },
      { new: true }
    );

    // Send response
    res.json({
      success: true,
      message: "Login successful",
      session: sessionId,
      email: user.email,
      plan: user.plan,
      id: user.pubId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

//user reg via other providers
exports.reguser = async (req, res) => {
  try {
    const { email, name, provider } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email are required",
      });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Find user by email
    let user = await User.findOne({ email: email.trim() });
    let pubId;

    if (!user) {
      console.log("2", user);
      // Generate a unique 6-digit pubId
      let isUnique = false;

      while (!isUnique) {
        // Generate a random 6-digit number
        pubId = Math.floor(100000 + Math.random() * 900000).toString();

        // Check if this pubId already exists
        const existingUser = await User.findOne({ pubId });
        if (!existingUser) {
          isUnique = true;
        }
      }

      const newUser = new User({
        email: email.trim(),
        name,
        pubId: pubId,
        promptCount: 5,
      });

      user = await newUser.save();
    }

    const sessionId = Math.floor(1000000000000 + Math.random() * 9000000000000);

    const newSession = new Session({
      session: sessionId,
      email: email.trim(),
      provider: provider,
    });

    await newSession.save();

    // update user with session id
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: { sessionId, provider, name } },
      { new: true }
    );

    // Send response
    res.json({
      success: true,
      message: "Login successful",
      session: sessionId,
      email: email.trim(),
      plan: updatedUser.plan,
      id: user.pubId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

exports.session = async (req, res) => {
  try {
    const { email, sessionId } = req.body;
    const session = await Session.findOne({ email, session: sessionId });

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Email not found",
      });
    }

    if (!session) {
      return res.status(400).json({
        success: false,
        message: "Invalid session",
      });
    }

    const sessionAge = (Date.now() - session.createdAt) / (1000 * 60 * 60 * 24);
    if (sessionAge > 7) {
      return res.status(400).json({
        success: false,
        message: "Session expired, please login again",
      });
    }

    // Send response
    res.json({
      success: true,
      message: "Authenticated!",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

exports.userData = async (req, res) => {
  try {
    const { email, provider } = req.body;
    let user = await User.findOne({ email });

    if (!user) {
      // Generate a unique 6-digit pubId
      let pubId;
      let isUnique = false;

      while (!isUnique) {
        // Generate a random 6-digit number
        pubId = Math.floor(100000 + Math.random() * 900000).toString();

        // Check if this pubId already exists
        const existingUser = await User.findOne({ pubId });
        if (!existingUser) {
          isUnique = true;
        }
      }

      user = new User({
        email: email,
        provider: provider,
        pubId: pubId,
        promptCount: 5,
      });
      await user.save();
    }

    const characters = "abcdefghijklmnopqrstuvwxyz123456789";
    const projectId = Array.from({ length: 16 }, () =>
      characters.charAt(Math.floor(Math.random() * characters.length))
    ).join("");

    res.json({
      success: true,
      user: {
        email: user.email,
        plan: user.plan,
        numberOfProjects: user.numberOfProjects,
        projectId: projectId,
      },
    });
  } catch (error) {
    console.error("User Data Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

exports.settings = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    // Calculate prompts based on plan
    let maxPrompts = user.plan === "free" ? 5 : 200;
    let promptsUsed =
      user.plan === "free" ? 5 - user.promptCount : 200 - user.promptCount;

    // Calculate days left in subscription if on scale plan
    let daysLeft = 0;
    if (user.plan === "scale" && user.subscriptionEndDate) {
      const now = new Date();
      const end = new Date(user.subscriptionEndDate);
      daysLeft = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
    }

    // Calculate time until next prompt reset for free plan
    let nextReset = null;
    if (user.plan === "free" && user.lastPromptReset) {
      const resetDate = new Date(user.lastPromptReset);
      resetDate.setDate(resetDate.getDate() + 1); // Reset every 24 hours
      nextReset = resetDate;
    }

    res.json({
      success: true,
      user: {
        email: user.email,
        plan: user.plan,
        subscriptionStatus: user.subscriptionStatus,
        remainingPrompts: user.promptCount,
        promptsUsed,
        maxPrompts,
        subscriptionEndDate: user.subscriptionEndDate,
        daysLeftInSubscription: daysLeft,
        nextPromptReset: nextReset,
        deployments: user.deployments,
        projectCount: user.numberOfProjects,
        id: user.pubId,
        claudeApiKey: user.claudeApiKey,
      },
    });
  } catch (error) {
    console.error("User Settings Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};
