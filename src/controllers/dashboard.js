const { ResendEmail } = require("../helpers/Resend");
const Logs = require("../models/logs");
const Project = require("../models/Project");
const Sessions = require("../models/Session");
const SubDatabase = require("../models/subDB");
const SubUser = require("../models/subUser");

exports.dlogin = async (req, res) => {
  try {
    const { email, password, method, otp, projectId } = req.body;

    const user = await SubUser.findOne({ email });
    const project = await Project.findOne({ generatedName: projectId });

    if (!project) {
      return res
        .status(400)
        .json({ message: "Invalid Project", success: false });
    }

    // Check if user exists in this project
    const userInProject =
      user &&
      project.subusers.some(
        (subUserId) => subUserId.toString() === user._id.toString()
      );

    // Check if user is blocked before allowing login
    if (user && project.blocked.includes(user._id)) {
      // Log blocked login attempt
      await new Logs({
        log: `Blocked user login attempt: ${email} (${method})`,
        projectId,
      }).save();

      return res
        .status(403)
        .json({ message: "User is blocked", success: false });
    }

    if (method === "pass") {
      if (!user) {
        // Create new user
        const u = new SubUser({ email, password, projectId, status: "active" });
        await u.save();

        // Add user to project's subusers array and increment total
        const updateResult = await Project.updateOne(
          { generatedName: projectId, subusers: { $ne: u._id } },
          {
            $addToSet: { subusers: u._id },
            $inc: { subuserstotal: 1 },
          }
        );

        // Log user creation
        await new Logs({
          log: `New user created and logged in: ${email} (password)`,
          projectId,
        }).save();

        res.status(200).json({
          message: "User created successfully",
          success: true,
          id: u._id,
        });
      } else if (!userInProject) {
        // User exists but not in this project - validate password first
        if (user.password !== password) {
          // Log failed login attempt
          await new Logs({
            log: `Failed login attempt: ${email} (invalid password)`,
            projectId,
          }).save();

          return res
            .status(400)
            .json({ message: "Invalid Credentials", success: false });
        }

        // Add existing user to project
        const updateResult = await Project.updateOne(
          { generatedName: projectId, subusers: { $ne: user._id } },
          {
            $addToSet: { subusers: user._id },
            $inc: { subuserstotal: 1 },
          }
        );

        // Log user addition to project
        await new Logs({
          log: `Existing user added to project: ${email} (password)`,
          projectId,
        }).save();

        res.status(200).json({
          message: "User added to project successfully",
          success: true,
          id: user._id,
        });
      } else {
        // User exists and is in project - authenticate
        if (user.password !== password) {
          // Log failed login attempt
          await new Logs({
            log: `Failed login attempt: ${email} (invalid password)`,
            projectId,
          }).save();

          return res
            .status(400)
            .json({ message: "Invalid Credentials", success: false });
        } else {
          // Log successful login
          await new Logs({
            log: `User logged in: ${email} (password)`,
            projectId,
          }).save();

          res.status(200).json({ success: true, id: user._id });
        }
      }
    } else {
      const sess = await Sessions.findOne({ email, otp });
      if (sess) {
        if (!user) {
          // Create new user
          const u = new SubUser({ email, projectId, status: "active" });
          await u.save();

          // Add user to project's subusers array and increment total
          const updateResult = await Project.updateOne(
            { generatedName: projectId, subusers: { $ne: u._id } },
            {
              $addToSet: { subusers: u._id },
              $inc: { subuserstotal: 1 },
            }
          );

          // Log user creation
          await new Logs({
            log: `New user created and logged in: ${email} (OTP)`,
            projectId,
          }).save();

          res.status(200).json({
            message: "User created successfully",
            success: true,
            id: u._id,
          });
        } else if (!userInProject) {
          // User exists but not in this project - add to project
          const updateResult = await Project.updateOne(
            { generatedName: projectId, subusers: { $ne: user._id } },
            {
              $addToSet: { subusers: user._id },
              $inc: { subuserstotal: 1 },
            }
          );

          // Log user addition to project
          await new Logs({
            log: `Existing user added to project: ${email} (OTP)`,
            projectId,
          }).save();

          res.status(200).json({
            message: "User added to project successfully",
            success: true,
            id: user._id,
          });
        } else {
          // User exists and is in project - authenticate
          // Log successful login
          await new Logs({
            log: `User logged in: ${email} (OTP)`,
            projectId,
          }).save();

          res.status(200).json({ success: true, id: user._id });
        }
      } else {
        // Log failed OTP attempt
        await new Logs({
          log: `Failed login attempt: ${email} (invalid OTP)`,
          projectId,
        }).save();

        res.status(400).json({ message: "Invalid OTP", success: false });
      }
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.sendOtp = async (req, res) => {
  try {
    const { email, projectId } = req.body;
    const user = await SubUser.findOne({ email });
    const project = await Project.findOne({ generatedName: projectId });

    if (!user && !project) {
      return res
        .status(400)
        .json({ message: "Invalid Project", success: false });
    }
    const otp = Math.floor(100000 + Math.random() * 900000);
    const se = Math.floor(10000000 + Math.random() * 90000000);
    const sess = new Sessions({ email, otp, session: se });
    await sess.save();

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
            <p>Hey, here is your Otp for Password reset:</p>
            <div class="otp-box">${otp}</div>
            <p>This OTP is valid for the next <strong>10 minutes</strong>.</p>
            <div class="footer">
              © 2025 Company.
            </div>
          </div>
        </body>
        </html>`,
    });

    // Log OTP request
    if (projectId) {
      await new Logs({
        log: `OTP requested: ${email}`,
        projectId,
      }).save();
    }

    res.status(200).json({ message: "OTP sent successfully", success: true });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.verifyotp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const sess = await Sessions.findOne({ email, otp });

    if (sess) {
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ message: "Invalid OTP", success: false });
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.resetpass = async (req, res) => {
  try {
    const { email, otp, pass: password } = req.body;

    // Validate input
    if (!email || !otp || !password) {
      return res.status(400).json({
        message: "Email, OTP, and new password are required",
        success: false,
      });
    }
    // Check if OTP session exists
    const sess = await Sessions.findOne({ email, otp });
    if (!sess) {
      return res.status(400).json({ message: "Invalid OTP", success: false });
    }

    // Check if user exists
    const user = await SubUser.findOne({ email });

    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }
    // Update user password
    await SubUser.updateOne({ email }, { password });

    // Delete the OTP session after successful password reset
    await Sessions.deleteOne({ email, otp });

    // Log password reset
    await new Logs({
      log: `Password reset completed: ${email}`,
      projectId: user.projectId,
    }).save();

    res.status(200).json({
      message: "Password reset successfully",
      success: true,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.subusercheck = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await SubUser.findById(email).select("_id email");
    if (user) {
      res.status(200).json({ success: true, user });
    } else {
      res.status(200).json({ success: false });
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getusers = async (req, res) => {
  try {
    const { projectId, from = 1, to = 10 } = req.body;

    // Validate project exists and get subusers array
    const project = await Project.findOne({ generatedName: projectId })
      .select("subusers blocked")
      .populate({
        path: "subusers",
        select: "_id email createdAt updatedAt",
        options: {
          skip: from - 1,
          limit: to - from + 1,
          sort: { createdAt: -1 },
        },
      });

    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found", success: false });
    }

    // Ensure subusers array exists and handle empty case
    const subusers = project.subusers || [];
    const blockedUsers = project.blocked || [];

    // Add blocking status to each user
    const usersWithStatus = subusers.map((user) => ({
      _id: user._id,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isBlocked: blockedUsers.some(
        (blockedId) => blockedId.toString() === user._id.toString()
      ),
      status: blockedUsers.some(
        (blockedId) => blockedId.toString() === user._id.toString()
      )
        ? "blocked"
        : "active",
    }));

    // Get total count for pagination info
    const totalProject = await Project.findOne({
      generatedName: projectId,
    }).select("subuserstotal");
    const totalUsers = totalProject ? totalProject.subuserstotal : 0;

    res.status(200).json({
      success: true,
      users: usersWithStatus,
      pagination: {
        from,
        to,
        total: totalUsers,
        hasMore: from - 1 + usersWithStatus.length < totalUsers,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.userstatus = async (req, res) => {
  try {
    const { email, projectId } = req.body;

    // Validate input
    if (!email || !projectId) {
      return res.status(400).json({
        message: "Email and projectId are required",
        success: false,
      });
    }

    // Find user and project
    const user = await SubUser.findOne({ email });
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    const project = await Project.findOne({ generatedName: projectId });
    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found", success: false });
    }

    // Check if user is currently blocked in this project
    const isBlocked = project.blocked.includes(user._id);

    if (isBlocked) {
      // Unblock user - remove from blocked array
      await Project.updateOne(
        { generatedName: projectId },
        { $pull: { blocked: user._id } }
      );

      // Log status change
      await new Logs({
        log: `User unblocked: ${email}`,
        projectId,
      }).save();

      res.status(200).json({
        message: "User unblocked successfully",
        success: true,
        status: "active",
        isBlocked: false,
      });
    } else {
      // Block user - add to blocked array
      await Project.updateOne(
        { generatedName: projectId },
        { $addToSet: { blocked: user._id } }
      );

      // Log status change
      await new Logs({
        log: `User blocked: ${email}`,
        projectId,
      }).save();

      res.status(200).json({
        message: "User blocked successfully",
        success: true,
        status: "blocked",
        isBlocked: true,
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.checkuser = async (req, res) => {
  try {
    const { email, projectId } = req.body;

    // Validate input
    if (!email || !projectId) {
      return res.status(400).json({
        message: "Email and projectId are required",
        success: false,
      });
    }

    // Validate project exists
    const project = await Project.findOne({ generatedName: projectId });
    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found", success: false });
    }

    // Check if user exists in the specific project
    const user = await SubUser.findOne({ email, projectId }).select(
      "_id email status createdAt"
    );

    if (user) {
      // Log user check
      await new Logs({
        log: `User existence checked: ${email} - found`,
        projectId,
      }).save();

      res.status(200).json({
        success: true,
        exists: true,
        user: {
          _id: user._id,
          email: user.email,
          status: user.status,
          createdAt: user.createdAt,
        },
      });
    } else {
      // Log user check
      await new Logs({
        log: `User existence checked: ${email} - not found`,
        projectId,
      }).save();

      res.status(200).json({
        success: true,
        exists: false,
        message: "User not found in this project",
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.adduser = async (req, res) => {
  try {
    const { email, password, projectId } = req.body;

    // Validate project exists
    const project = await Project.findOne({ generatedName: projectId });
    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found", success: false });
    }

    // Check if user already exists
    const existingUser = await SubUser.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User already exists", success: false });
    }

    // Create new user
    const newUser = new SubUser({
      email,
      password,
      projectId,
      status: "active",
    });

    await newUser.save();

    // Add user to project's subusers array and increment total
    const updateResult = await Project.updateOne(
      { generatedName: projectId, subusers: { $ne: newUser._id } },
      {
        $addToSet: { subusers: newUser._id },
        $inc: { subuserstotal: 1 },
      }
    );

    // Log user addition
    await new Logs({
      log: `Admin added new user: ${email}`,
      projectId,
    }).save();

    res.status(200).json({
      message: "User added successfully",
      success: true,
      user: { _id: newUser._id, email: newUser.email },
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.doverview = async (req, res) => {
  try {
    const { projectId } = req.body;

    // Validate project exists
    const project = await Project.findOne({ generatedName: projectId }).select(
      "ep eo subuserstotal"
    );
    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found", success: false });
    }

    const logs = await Logs.countDocuments({ projectId });

    res.status(200).json({
      success: true,
      users: project.subuserstotal,
      logs,
      auth: project,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.authmethods = async (req, res) => {
  try {
    const { projectId, method, value } = req.body;

    // Validate input
    if (!projectId || !method || value === undefined) {
      return res.status(400).json({
        message: "ProjectId, method, and value are required",
        success: false,
      });
    }

    // Validate method
    if (method !== "ep" && method !== "eo") {
      return res.status(400).json({
        message: "Method must be either 'ep' or 'eo'",
        success: false,
      });
    }

    // Validate value
    if (typeof value !== "boolean") {
      return res.status(400).json({
        message: "Value must be a boolean",
        success: false,
      });
    }

    const project = await Project.findOne({ generatedName: projectId });
    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found", success: false });
    }

    // Update the specific method
    const updateData = {};
    updateData[method] = value;

    await Project.updateOne({ generatedName: projectId }, updateData);

    // Get updated project data
    const updatedProject = await Project.findOne({
      generatedName: projectId,
    }).select("ep eo");

    res.status(200).json({
      success: true,
      message: `${method.toUpperCase()} updated successfully`,
      auth: { ep: updatedProject.ep, eo: updatedProject.eo },
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.dlogs = async (req, res) => {
  try {
    const { projectId } = req.body;

    // Validate project exists
    const project = await Project.findOne({ generatedName: projectId });
    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found", success: false });
    }

    const logs = await Logs.find({ projectId })
      .select("_id log createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({ success: true, logs });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getinternalDB = async (req, res) => {
  try {
    const { projectId, email, from = 1, to = 10 } = req.body;

    // Validate project exists
    const project = await Project.findOne({ generatedName: projectId });
    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found", success: false });
    }

    // Check if user exists and is authorized
    const user = await SubUser.findOne({ email });
    if (!user) {
      return res.status(403).json({ message: "Unauthorized", success: false });
    }

    // Calculate skip and limit for pagination
    const skip = from - 1;
    const limit = to - from + 1;

    const records = await SubDatabase.find({ projectId })
      .select("_id type data createdAt updatedAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({ success: true, records });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

//DB
exports.addDB = async (req, res) => {
  try {
    const { projectId, email, type, data } = req.body;

    // Validate project exists
    const project = await Project.findOne({ generatedName: projectId });
    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found", success: false });
    }

    // Check if user exists and is authorized
    const user = await SubUser.findById(email);
    if (!user) {
      return res.status(403).json({ message: "Unauthorized", success: false });
    }

    const db = new SubDatabase({ projectId, type, data });
    await db.save();

    // Log DB record addition
    await new Logs({
      log: `DB record added by ${email}: type=${type}`,
      projectId,
    }).save();

    res.status(200).json({ success: true, message: "DB added successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.deleteDB = async (req, res) => {
  try {
    const { projectId, email, type, data } = req.body;

    // Validate input
    if (!projectId || !email || !type || !data) {
      return res.status(400).json({
        message: "ProjectId, email, type, and data are required",
        success: false,
      });
    }

    // Validate project exists
    const project = await Project.findOne({ generatedName: projectId });
    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found", success: false });
    }

    // Check if user exists and is authorized
    const user = await SubUser.findById(email);
    if (!user) {
      return res.status(403).json({ message: "Unauthorized", success: false });
    }

    // Get record info before deletion for logging and validation
    const recordToDelete = await SubDatabase.findOne({
      projectId,
      type,
      data,
    });
    if (!recordToDelete) {
      return res
        .status(404)
        .json({ message: "Record not found", success: false });
    }

    // Delete the record by type and data
    await SubDatabase.deleteOne({ projectId, type, data });

    // Log DB record deletion
    await new Logs({
      log: `DB record deleted by ${email}: type=${type}, data match deleted`,
      projectId,
    }).save();

    res.status(200).json({
      success: true,
      message: "DB record deleted successfully",
      deletedRecord: {
        id: recordToDelete._id,
        type: recordToDelete.type,
        data: recordToDelete.data,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getDB = async (req, res) => {
  try {
    const { projectId, email, from = 1, to = 10 } = req.body;

    // Validate project exists
    const project = await Project.findOne({ generatedName: projectId });
    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found", success: false });
    }

    // Check if user exists and is authorized
    const user = await SubUser.findById(email);

    if (!user || project.subusers.includes(user._id) === false) {
      return res.status(403).json({ message: "Unauthorized", success: false });
    }

    // Calculate skip and limit for pagination
    const skip = from - 1;
    const limit = to - from + 1;

    const records = await SubDatabase.find({ projectId })
      .select("_id type data createdAt updatedAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({ success: true, records });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.updateDB = async (req, res) => {
  try {
    const { projectId, email, id, type, data } = req.body;

    // Validate project exists
    const project = await Project.findOne({ generatedName: projectId });
    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found", success: false });
    }

    // Check if user exists and is authorized
    const user = await SubUser.findOne({ email });
    if (!user || project.subusers.includes(user._id) === false) {
      return res.status(403).json({ message: "Unauthorized", success: false });
    }

    // Check if record exists
    const record = await SubDatabase.findOne({ _id: id, projectId });
    if (!record) {
      return res
        .status(404)
        .json({ message: "Record not found", success: false });
    }

    // Update the record
    const updateData = {};
    if (type !== undefined) updateData.type = type;
    if (data !== undefined) updateData.data = data;

    await SubDatabase.updateOne({ _id: id, projectId }, updateData);

    // Log DB record update
    const updateFields = Object.keys(updateData).join(", ");
    await new Logs({
      log: `DB record updated by ${email}: id=${id}, fields=[${updateFields}]`,
      projectId,
    }).save();

    res.status(200).json({
      success: true,
      message: "Record updated successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.getdata = async (req, res) => {
  try {
    const { projectId, email, type, data } = req.body;

    // Validate input
    if (!projectId || !email || !type || !data) {
      return res.status(400).json({
        message: "ProjectId, email, type, and data are required",
        success: false,
      });
    }

    // Validate project exists
    const project = await Project.findOne({ generatedName: projectId });
    if (!project) {
      return res
        .status(404)
        .json({ message: "Project not found", success: false });
    }

    // Check if user exists and is authorized
    const user = await SubUser.findById(id);
    if (!user || !project.subusers.includes(user._id)) {
      return res.status(403).json({ message: "Unauthorized", success: false });
    }

    // Fetch the specific record by type and data
    const record = await SubDatabase.findOne({
      projectId,
      type,
      data,
    }).select("_id projectId type data createdAt updatedAt");

    if (!record) {
      return res
        .status(404)
        .json({ message: "Record not found", success: false });
    }

    // Log data access
    await new Logs({
      log: `Record accessed by ${email}: type=${type}, data match found`,
      projectId,
    }).save();

    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Internal Server Error");
  }
};

exports.checkproject = async (req, res) => {
  try {
    const { projectId } = req.body;
    const project = await Project.findOne({ generatedName: projectId });

    if (project) {
      res
        .status(200)
        .json({ success: true, auth: { ep: project.ep, eo: project.eo } });
    } else {
      res.status(403).json({ success: false });
    }
  } catch (error) {
    console.log(error);
    res.status(400).json({ success: false });
  }
};
