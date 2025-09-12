const { agent } = require("../helpers/agent");
const { startUnifiedAgent } = require("../helpers/UnifiedAgent");
const Message = require("../models/Message");
const Project = require("../models/Project");
const User = require("../models/User");

exports.agent = async (req, res) => {
  try {
    const { prompt, memory, cssLib, framework, images, projectId, owner } =
      req.body;

    // Set SSE headers
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    // Start agent processing directly writing to res
    await agent(
      prompt,
      memory,
      cssLib,
      framework,
      images,
      projectId,
      owner,
      res
    );
  } catch (error) {
    console.error("Error in agent route:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    res.write(`data: Error: ${message}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
};

exports.handleAgent = async (req, res) => {
  try {
    const {
      prompt,
      projectId,
      owner,
      terminal,
      model,
      memory,
      cssLib,
      framework,
      images,
      fix,
      save,
    } = req.body;

    // Validate prompt
    if (!prompt || typeof prompt !== "string") {
      console.log("Invalid prompt:", prompt);
      return res.status(400).json({
        error: "Prompt is required and must be a string",
      });
    }

    const user = await User.findOne({ email: owner });
    const project = await Project.findOne({ generatedName: projectId });

    if (!user && !project) {
      return res.status(400).json({
        error: "User or project not found",
      });
    }

    // if (save !== true) {
    //   const msg = new Message({
    //     projectId: project._id,
    //     userId: user._id,
    //     text: prompt,
    //     role: "user",
    //   });

    //   await msg.save();
    // }

    // Set SSE headers
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    // Use the unified agent for all requests
    await startUnifiedAgent(
      prompt,
      projectId,
      owner,
      res,
      terminal,
      "gpt-4.1",
      memory,
      "tailwindcss",
      framework,
      images,
      fix,
      user._id
    );
  } catch (error) {
    console.error("Error in unified agent route:", error);
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred";
    res.write(`data: Error: ${message}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
};
