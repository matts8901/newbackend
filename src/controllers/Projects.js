const Project = require("../models/Project");
const User = require("../models/User");
const Message = require("../models/Message");
const Plan = require("../models/Plan");
const { s3, invalidateCloudFront } = require("../helpers/Aws");
const { BUCKET_NAME, BUCKET_URL, CLOUDFRONTID } = require("../config");
const Code = require("../models/Code");
const { default: axios } = require("axios");
const { generateDetails } = require("../helpers/agent");
const { addToBuildQueue } = require("../helpers/buildQueue");
const { createPlan } = require("../helpers/UnifiedAgent");

async function processImageData(urls) {
  if (!urls || (Array.isArray(urls) && urls.length === 0)) {
    return [];
  }

  const imageParts = [];
  const urlArray = Array.isArray(urls) ? urls : [urls];
  let mimeType;
  for (const url of urlArray) {
    if (!url || typeof url !== "string") {
      console.warn(`Skipping invalid image URL: ${url}`);
      continue;
    }
    try {
      const response = await axios.get(url, { responseType: "arraybuffer" }); // Use axios.get with arraybuffer
      const contentType = response.headers["content-type"];
      if (!contentType || !contentType.startsWith("image/")) {
        const extension = url.split(".").pop()?.toLowerCase();
        let inferredMimeType;
        switch (extension) {
          case "jpg":
          case "jpeg":
            inferredMimeType = "image/jpeg";
            break;
          case "png":
            inferredMimeType = "image/png";
            break;
          case "webp":
            inferredMimeType = "image/webp";
            break;
          case "gif":
            inferredMimeType = "image/gif";
            break;
          default:
            console.warn(
              `Could not determine valid image MIME type for ${url}. Content-Type: ${contentType}. Skipping.`
            );
            continue;
        }
        mimeType = inferredMimeType;
      } else {
        mimeType = contentType;
      }

      const imageBuffer = response.data; // Axios response.data is the arraybuffer
      const base64Data = Buffer.from(imageBuffer).toString("base64");

      imageParts.push({
        base64Data,
      });
    } catch (error) {
      console.error(`Error processing image URL ${url}:`, error);
    }
  }

  return imageParts;
}

// exports.createProject = async (req, res) => {
//   try {
//     const {
//       input,
//       memory,
//       cssLibrary = "tailwindcss",
//       framework = "react",
//       projectId,
//       owner,
//       images,
//       model = "gpt-4.1",
//     } = req.body;
//     const user = await User.findOne({ email: owner }).select(
//       "_id plan promptCount pubId isbuilding"
//     );

//     user.isbuilding = false;
//     await user.save();
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: "User not found!",
//       });
//     }

//     const existingProject = await Project.findOne({
//       generatedName: projectId,
//       status: "active",
//     })
//       .lean()
//       .exec();

//     if (existingProject) {
//       const messages = await Message.find({ projectId: existingProject._id })
//         .sort({ createdAt: -1 })
//         .select("role text images")
//         .limit(50)
//         .lean()
//         .exec();

//       const plan = await Plan.findOne({
//         projectId: existingProject._id,
//         user: user._id,
//       }).sort({ createdAt: -1 });

//       const code = await Code.findOne({
//         projectId: projectId,
//         user: owner,
//       });

//       if (existingProject.url) {
//         return res.json({
//           success: true,
//           messages: messages.reverse(),
//           title: existingProject.title,
//           projectId: existingProject.generatedName,
//           input: existingProject.input,
//           csslib: existingProject.csslibrary,
//           framework: existingProject.framework,
//           memory: existingProject.memory,
//           url: existingProject.url,
//           lastResponder: existingProject.lastResponder,
//           isResponseCompleted: existingProject.isResponseCompleted,
//           email: user.email,
//           promptCount: user.promptCount,
//           plan: user.plan,
//           id: user.pubId,
//           code: code && code.files.length > 0 ? code.files : [],
//           model: existingProject.model || "gpt-4.1",
//           isbuilding: user.isbuilding,
//         });
//       } else {
//         // Handle enh_prompt format based on framework
//         let enhPromptForExisting = existingProject.enh_prompt;
//         if (
//           existingProject.framework !== "web-components" &&
//           existingProject.enh_prompt
//         ) {
//           try {
//             const parsedPrompt = JSON.parse(existingProject.enh_prompt);
//             if (parsedPrompt.data) {
//               enhPromptForExisting = {
//                 data: parsedPrompt.data,
//                 url: parsedPrompt.url,
//               };
//             }
//           } catch (e) {
//             // If parsing fails, keep original format
//             enhPromptForExisting = existingProject.enh_prompt;
//           }
//         }

//         return res.json({
//           success: true,
//           messages: messages.reverse(),
//           title: existingProject.title,
//           projectId: existingProject.generatedName,
//           input: existingProject.input,
//           csslib: existingProject.csslibrary,
//           framework: existingProject.framework,
//           memory: existingProject.memory,
//           email: user.email,
//           enh_prompt: enhPromptForExisting,
//           lastResponder: existingProject.lastResponder,
//           isResponseCompleted: existingProject.isResponseCompleted,
//           promptCount: user.promptCount,
//           plan: user.plan,
//           id: user.pubId,
//           model: existingProject.model || "gpt-4.1",
//           isbuilding: user.isbuilding,
//         });
//       }
//     } else {
//       // Call the new createPlan function which returns structured data
//       const planResult = await createPlan(
//         input,
//         images,
//         memory,
//         cssLibrary,
//         framework,
//         model
//       );

//       let projectName, message, prompt;

//       // Fallback for any legacy format or string response
//       let textToParse =
//         typeof planResult === "string"
//           ? planResult
//           : JSON.stringify(planResult);

//       // Clean any remaining code block markers
//       textToParse = textToParse
//         .replace(/```json/g, "")
//         .replace(/```/g, "")
//         .trim();

//       try {
//         const parsed = JSON.parse(textToParse);

//         const {
//           projectName: oldProjectName,
//           message: oldMessage,
//           summary,
//           features,
//           memoryEnhancement,
//           theme,
//         } = parsed;

//         projectName = oldProjectName;
//         message = oldMessage;

//         prompt = {
//           summary,
//           features,
//           memoryEnhancement,
//           theme,
//         };
//       } catch (parseError) {
//         console.error("Error parsing plan result:", parseError);
//         // Ultimate fallback
//         projectName = "Generated Project";
//         message = "Should I continue with this plan?";
//         prompt = {
//           type: "plan",
//           action: "project planning",
//           data: textToParse,
//           plan: textToParse,
//           framework: framework,
//           cssLibrary: cssLibrary,
//         };
//       }

//       const project = await Project.create({
//         title: projectName,
//         originalInput: input,
//         memory,
//         csslibrary: cssLibrary,
//         framework,
//         generatedName: projectId,
//         owner: user._id,
//         enh_prompt: JSON.stringify(prompt),
//         model: model || "gpt-4.1",
//       });

//       const plan = await Plan.create({
//         user: user._id,
//         projectId: project._id,
//         text: prompt.data || JSON.stringify(prompt),
//         images: images,
//         role: "ai",
//       });

//       await plan.save();

//       const msg = await Message.create({
//         text: input,
//         user: user._id,
//         projectId: project._id,
//         role: "user",
//         images,
//       });

//       const AImessage = await Message.create({
//         text: message,
//         user: user._id,
//         projectId: project._id,
//         role: "ai",
//         seq: Message.countDocuments() + 1,
//       });

//       await User.updateOne(
//         { _id: user._id },
//         {
//           $push: { projects: project._id },
//           $inc: { numberOfProjects: 1 },
//         }
//       );

//       if (user.promptCount > 0) {
//         user.promptCount = user.promptCount - 1;
//         await user.save();
//       }

//       // Return appropriate enh_prompt based on format
//       const enhPromptForResponse = JSON.stringify(prompt);

//       return res.json({
//         success: true,
//         messages: [
//           { role: "user", text: msg.text, images: msg.images },
//           { role: "ai", text: AImessage.text },
//         ],
//         title: project.title,
//         projectId: project.generatedName,
//         input: input,
//         csslib: cssLibrary,
//         framework: framework,
//         memory: memory,
//         email: user.email,
//         promptCount: user.promptCount,
//         plan: user.plan,
//         enh_prompt: enhPromptForResponse,
//         id: user.pubId,
//         model: model || "gpt-4.1",
//         isbuilding: user.isbuilding,
//       });
//     }
//   } catch (error) {
//     console.error("Error creating project:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error. Please try again later.",
//     });
//   }
// };

exports.createProject = async (req, res) => {
  try {
    const {
      input,
      memory,
      cssLibrary,
      framework,
      projectId,
      owner,
      images,
      model,
    } = req.body;
    const user = await User.findOne({ email: owner }).select(
      "_id plan promptCount pubId plan"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    const existingProject = await Project.findOne({
      generatedName: projectId,
      status: "active",
    })
      .lean()
      .exec();

    if (existingProject) {
      const messages = await Message.find({ projectId: existingProject._id })
        .sort({ createdAt: -1 })
        .select("role text images")
        .limit(100)
        .lean()
        .exec();

      const plan = await Plan.findOne({
        projectId: existingProject._id,
        user: user._id,
      }).sort({ createdAt: -1 });

      const code = await Code.findOne({
        projectId: projectId,
        user: owner,
      });

      if (existingProject.url) {
        const allcode = await axios
          .get(existingProject.url)
          .then((res) => {
            return res.data;
          })
          .catch((err) => {
            console.log(err);
            return null;
          });

        return res.json({
          success: true,
          messages: messages.reverse(),
          title: existingProject.title,
          projectId: existingProject.generatedName,
          input: existingProject.input,
          csslib: existingProject.csslibrary,
          framework: existingProject.framework,
          memory: existingProject.memory,
          url: existingProject.url,
          lastResponder: existingProject.lastResponder,
          isResponseCompleted: existingProject.isResponseCompleted,
          email: user.email,
          promptCount: user.promptCount,
          plan: user.plan,
          id: user.pubId,
          code: code && code.files.length > 0 ? code.files : [],
          model: existingProject.model || "gpt-4.1",
          apikey: user.claudeApiKey,
        });
      } else {
        // Handle enh_prompt format based on framework
        let enhPromptForExisting = existingProject.enh_prompt;
        if (existingProject.enh_prompt) {
          try {
            const parsedPrompt = JSON.parse(existingProject.enh_prompt);
            if (parsedPrompt.data) {
              enhPromptForExisting = {
                data: parsedPrompt.data,
                url: parsedPrompt.url,
              };
            }
          } catch (e) {
            // If parsing fails, keep original format
            enhPromptForExisting = existingProject.enh_prompt;
          }
        }

        return res.json({
          success: true,
          messages: messages.reverse(),
          title: existingProject.title,
          projectId: existingProject.generatedName,
          input: existingProject.input,
          csslib: existingProject.csslibrary,
          framework: existingProject.framework,
          memory: existingProject.memory,
          email: user.email,
          enh_prompt: enhPromptForExisting,
          lastResponder: existingProject.lastResponder,
          isResponseCompleted: existingProject.isResponseCompleted,
          promptCount: user.promptCount,
          plan: user.plan,
          id: user.pubId,
          model: existingProject.model || "gpt-4.1",
          apikey: user.claudeApiKey,
        });
      }
    } else {
      // Call the new createPlan function which returns structured data
      const planResult = await createPlan(
        input,
        images,
        memory,
        cssLibrary,
        framework,
        "claude-sonnet-4"
      );

      let projectName, message, prompt;

      // Handle the new createPlan response format: {title, message, plan, url}
      if (planResult && typeof planResult === "object" && planResult.title) {
        // New structured format from createPlan
        projectName = planResult.title;
        message = planResult.message;

        // Store the complete plan data in enh_prompt with all the new structured data
        prompt = {
          type: "plan",
          action: "project planning",
          data: planResult.plan,
          plan: planResult.plan,
          framework: framework,
          cssLibrary: cssLibrary,
          url: planResult.url || "",
          title: planResult.title,
          // Store the structured plan components for future use
          frontendFiles: planResult.frontendFiles || [],
          backendRoutes: planResult.backendRoutes || [],
          brandKit: planResult.brandKit || {},
          replicationStrategy: planResult.replicationStrategy || null,
        };
      } else {
        // Fallback for any legacy format or string response
        let textToParse =
          typeof planResult === "string"
            ? planResult
            : JSON.stringify(planResult);

        // Clean any remaining code block markers
        textToParse = textToParse
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();

        try {
          const parsed = JSON.parse(textToParse);

          // Check if it's the old structured format
          if (parsed.type && parsed.action && parsed.data) {
            // Old format: {type, action, data, message}
            projectName =
              parsed.data.split("\n")[0].replace("Project: ", "") ||
              "Unnamed Project";
            message = parsed.message;

            prompt = {
              type: parsed.type,
              action: parsed.action,
              data: parsed.data,
              plan: parsed.data,
              framework: framework,
              cssLibrary: cssLibrary,
              url: parsed.url,
            };
          } else if (parsed.projectName) {
            //  old format: {projectName, message, summary, features, memoryEnhancement, theme}
            const {
              projectName: oldProjectName,
              message: oldMessage,
              summary,
              features,
              memoryEnhancement,
              theme,
            } = parsed;

            projectName = oldProjectName;
            message = oldMessage;

            prompt = {
              summary,
              features,
              memoryEnhancement,
              theme,
            };
          } else {
            // Fallback if parsing doesn't match expected formats
            projectName = "Generated Project";
            message = "Should I continue with this plan?";
            prompt = {
              type: "plan",
              action: "project planning",
              data: textToParse,
              plan: textToParse,
              framework: framework,
              cssLibrary: cssLibrary,
            };
          }
        } catch (parseError) {
          console.error("Error parsing plan result:", parseError);
          // Ultimate fallback
          projectName = "Generated Project";
          message = "Should I continue with this plan?";
          prompt = {
            type: "plan",
            action: "project planning",
            data: textToParse,
            plan: textToParse,
            framework: framework,
            cssLibrary: cssLibrary,
          };
        }
      }

      const project = await Project.create({
        title: projectName,
        originalInput: input,
        memory,
        csslibrary: cssLibrary,
        framework,
        generatedName: projectId,
        owner: user._id,
        enh_prompt: JSON.stringify(prompt),
        model: model || "gpt-4.1",
      });

      const plan = await Plan.create({
        user: user._id,
        projectId: project._id,
        text: prompt.data || JSON.stringify(prompt),
        images: images,
        role: "ai",
      });

      await plan.save();

      const msg = await Message.create({
        text: input,
        user: user._id,
        projectId: project._id,
        role: "user",
        images,
      });

      const AImessage = await Message.create({
        text: message,
        user: user._id,
        projectId: project._id,
        role: "ai",
        seq: Message.countDocuments() + 1,
      });

      await User.updateOne(
        { _id: user._id },
        {
          $push: { projects: project._id },
          $inc: { numberOfProjects: 1 },
        }
      );

      if (user.promptCount > 0) {
        user.promptCount = user.promptCount - 1;
        await user.save();
      }

      // Return appropriate enh_prompt based on format
      const enhPromptForResponse =
        { data: prompt.data, url: prompt.url } || JSON.stringify(prompt);

      return res.json({
        success: true,
        messages: [
          { role: "user", text: msg.text, images: msg.images },
          { role: "ai", text: AImessage.text },
        ],
        title: project.title,
        projectId: project.generatedName,
        input: input,
        csslib: cssLibrary,
        framework: framework,
        memory: memory,
        email: user.email,
        promptCount: user.promptCount,
        plan: user.plan,
        enh_prompt: enhPromptForResponse,
        id: user.pubId,
        model: model || "gpt-4.1",
        apikey: user.claudeApiKey,
      });
    }
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

exports.buildCode = async (req, res) => {
  try {
    const { email, projectId } = req.body;
    const user = await User.findOne({ email: email });
    const project = await Project.findOne({ generatedName: projectId });

    if (!user || !project || !project.url) {
      return res.status(400).json({
        message: "User or Project or Project url not found!",
        success: false,
      });
    }

    // // Prepare build data for the queue
    const buildData = {
      projectId: project.generatedName,
      userId: user._id,
      email: user.email,
      url: project.url,
    };

    // Add job to build queue
    const job = await addToBuildQueue(buildData, {
      priority: 1,
      delay: 0,
      removeOnComplete: 5,
      removeOnFail: 3,
    });

    if (job.exists) {
      return res.status(201).json({
        message: "Already building!",
        success: true,
      });
    }

    user.isbuilding = true;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Build queued successfully",
    });
  } catch (error) {
    console.error("Error queuing build job:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

exports.presigned = async (req, res) => {
  try {
    const { fileName, fileType, email, projectId } = req.body;

    const user = await User.findOne({ email: email });

    if (!user) {
      return res
        .status(400)
        .json({ message: "User not found!", success: false });
    }

    const params = {
      Bucket: BUCKET_NAME,
      Key: `projects/${user._id}/uploads/${fileName}`,
      Expires: 60,
      ContentType: fileType,
    };

    const uploadURL = await s3.getSignedUrlPromise("putObject", params);
    res.json({
      uploadURL,
      url: `${BUCKET_URL}/projects/${user._id}/uploads/${fileName}`,
      key: params.Key,
      success: true,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to generate pre-signed URL" });
  }
};

exports.getProject = async (req, res) => {
  try {
    const { p: projectId } = req.query;

    const project = await Project.findOne({
      generatedName: projectId,
      status: "active",
    }).select("title");

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found!",
      });
    }

    res.json({
      success: true,
      title: project.title,
    });
  } catch (error) {
    console.error("Error getting project:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

exports.getAllProjects = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    const projects = await Project.find({ owner: user, status: "active" })
      .select(
        "title _id updatedAt memory isPinned isPublic generatedName deployed_url"
      )
      .limit(500)
      .lean()
      .exec();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    if (!Project) {
      return res.status(201).json({
        success: true,
        message: "Projects not found!",
      });
    }

    res.json({
      success: true,
      projects: projects.reverse(),
    });
  } catch (error) {
    console.error("Error getting project:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

//fetch all messages
exports.getMessages = async (req, res) => {
  const { p: projectId, loadMore } = req.query;

  try {
    const project = await Project.findOne(
      { generatedName: projectId, status: "active" },
      { _id: 1 }
    )
      .lean()
      .exec();

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found!",
      });
    }

    const messages = await Message.find(
      { projectId: project._id },
      { _id: 0, __v: 0, projectId: 0 }
    )
      .sort({ createdAt: -1 })
      .skip(loadMore ? parseInt(loadMore) : 0)
      .limit(10)
      .lean()
      .exec();

    if (messages.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No messages found!",
      });
    }

    res.json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error("Error getting messages:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

async function uploadComponentsToS3(jsonString, bucketName, projectName) {
  try {
    // Parse the JSON string
    const data = JSON.parse(jsonString);

    // Initialize result object for tracking upload status
    const uploadResults = [];

    // Iterate through the keys in the JSON (file paths)
    for (const filePath in data) {
      // Check if the file is in /components/ and is a .js file, excluding block-manifest.json

      if (
        filePath.startsWith("/components/") &&
        filePath.endsWith(".js") &&
        !filePath.includes("block-manifest.json")
      ) {
        // Extract component name from file name (e.g., yahoo-navbar.js -> yahoo-navbar)
        const componentName = filePath.split("/").pop().replace(".js", "");

        // Get the code string
        const code = data[filePath].code;

        // Define S3 parameters for this component
        const params = {
          Bucket: bucketName,
          Key: `v1/${projectName}/components/${componentName}.js`, // e.g., components/yahoo-navbar.js
          Body: code,
          ContentType: "text/javascript", // Set to text/javascript for .js files
          CacheControl: "no-cache, no-store, must-revalidate", // Forces immediate refresh
          Expires: new Date(0), // Prevents old versions being served
        };

        // Upload to S3
        try {
          await new Promise((resolve, reject) => {
            s3.putObject(params, (error, data) => {
              if (error) {
                console.error(`Error uploading ${componentName} to S3:`, error);
                uploadResults.push({
                  component: componentName,
                  success: false,
                  error: error.message,
                });
                resolve(); // Continue with other uploads
              } else {
                console.log(`Successfully uploaded ${componentName} to S3`);
                uploadResults.push({ component: componentName, success: true });
                resolve();
              }
            });
          });
        } catch (uploadError) {
          console.error(
            `Error in upload promise for ${componentName}:`,
            uploadError
          );
          uploadResults.push({
            component: componentName,
            success: false,
            error: uploadError.message,
          });
        }
      }

      if (filePath.startsWith("/design-system/") && filePath.endsWith(".css")) {
        // Extract component name from file name (e.g., yahoo-navbar.js -> yahoo-navbar)
        const tokenName = filePath.split("/").pop().replace(".css", "");

        // Get the code string
        const code = data[filePath].code;

        // Define S3 parameters for this component
        const params = {
          Bucket: bucketName,
          Key: `v1/${projectName}/design-system/${tokenName}.css`,
          Body: code,
          ContentType: "text/css",
          CacheControl: "no-cache, no-store, must-revalidate",
          Expires: new Date(0),
        };

        // Upload to S3
        try {
          await new Promise((resolve, reject) => {
            s3.putObject(params, (error, data) => {
              if (error) {
                console.error(`Error uploading ${tokenName} to S3:`, error);
                uploadResults.push({
                  token: tokenName,
                  success: false,
                  error: error.message,
                });
                resolve(); // Continue with other uploads
              } else {
                console.log(`Successfully uploaded ${tokenName} to S3`);
                uploadResults.push({ token: tokenName, success: true });
                resolve();
              }
            });
          });
        } catch (uploadError) {
          console.error(
            `Error in upload promise for ${tokenName}:`,
            uploadError
          );
          uploadResults.push({
            token: tokenName,
            success: false,
            error: uploadError.message,
          });
        }
      }
    }

    // Return upload results
    return {
      success: uploadResults.every((result) => result.success),
      results: uploadResults,
    };
  } catch (error) {
    console.error("Error parsing JSON or processing components:", error);
    return {
      success: false,
      message: "Failed to parse JSON or process components.",
      error: error.message,
    };
  }
}

//save project
exports.saveProject = async (req, res) => {
  try {
    const { projectId, owner, data } = req.body;
    console.log(data);
    uploadComponentsToS3(data, BUCKET_NAME, projectId);

    const project = await Project.findOne({
      generatedName: projectId,
      status: "active",
    })
      .select("_id")
      .lean()
      .exec();

    const user = await User.findOne({ email: owner })
      .select("_id")
      .lean()
      .exec();

    if (!project || !user) {
      return res.status(500).json({
        success: false,
        message: "User or project not found!",
      });
    }

    // Define S3 params
    const params = {
      Bucket: BUCKET_NAME,
      Key: `projects/${user._id}/${project._id}`,
      Body: data,
      ContentType: "application/json",
      CacheControl: "no-cache, no-store, must-revalidate", // Forces immediate refresh
      Expires: new Date(0), // Prevents old versions being served
    };

    // Ensure URL updates in the database
    await Project.updateOne(
      { _id: project._id },
      {
        $set: {
          url: `${BUCKET_URL}/projects/${user._id}/${project._id}`,
          lastResponder: "ai",
          isResponseCompleted: true,
        },
      }
    );

    // Use putObject for guaranteed overwrite
    s3.putObject(params, (error, data) => {
      if (error) {
        console.error("Error uploading to S3:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to upload project to S3.",
        });
      }

      //Invalidating cache
      invalidateCloudFront(CLOUDFRONTID, [
        `${BUCKET_URL}/projects/${user._id}/${project._id}`,
      ])
        .then(() => console.log("Invalidation successful"))
        .catch((err) => console.error("Invalidation error:", err));

      res.json({
        success: true,
        message: "Project saved successfully!",
        url: `${BUCKET_URL}/projects/${user._id}/${project._id}`,
      });
    });
  } catch (error) {
    console.error("Error saving project:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

exports.updatefiles = async (req, res) => {
  try {
    const { content, filePath, currentFile, projectId, email } = req.body;

    const user = await User.findOne({ email: email })
      .select("_id")
      .lean()
      .exec();
    const project = await Project.findOne({
      generatedName: projectId,
      status: "active",
    })
      .select("_id url")
      .lean()
      .exec();

    if (!project || !user) {
      return res.status(500).json({
        success: false,
        message: "User or project not found!",
      });
    }

    if (!project.url) {
      return res.status(400).json({
        success: false,
        message: "Project URL not found!",
      });
    }

    // Fetch the current project data from the URL
    let projectData;
    try {
      const response = await axios.get(project.url);
      projectData = response.data;
    } catch (error) {
      console.error("Error fetching project data:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch project data.",
      });
    }

    // Ensure filePath starts with "/" for consistency
    const normalizedFilePath = filePath.startsWith("/")
      ? filePath
      : `/${filePath}`;

    // Check if the file exists in the project data
    if (!projectData[normalizedFilePath]) {
      return res.status(400).json({
        success: false,
        message: `File not found in project: ${normalizedFilePath}`,
      });
    }

    // Update the file's code
    projectData[normalizedFilePath].code = content;

    // Convert back to JSON string
    const updatedProjectData = JSON.stringify(projectData);

    // Define S3 params to save the entire updated project structure
    const params = {
      Bucket: BUCKET_NAME,
      Key: `projects/${user._id}/${project._id}`,
      Body: updatedProjectData,
      ContentType: "application/json",
      CacheControl: "no-cache, no-store, must-revalidate", // Forces immediate refresh
      Expires: new Date(0), // Prevents old versions being served
    };

    // Use putObject for guaranteed overwrite
    s3.putObject(params, (error, data) => {
      if (error) {
        console.error("Error uploading to S3:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to upload project to S3.",
        });
      }

      // Invalidate CloudFront cache
      invalidateCloudFront(CLOUDFRONTID, [
        `${BUCKET_URL}/projects/${user._id}/${project._id}`,
      ])
        .then(() => console.log("Cache invalidation successful"))
        .catch((err) => console.error("Cache invalidation error:", err));

      res.json({
        success: true,
        message: "File updated successfully!",
        url: `${BUCKET_URL}/projects/${user._id}/${project._id}`,
      });
    });
  } catch (error) {
    console.error("Error updating file:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

//save s3
exports.saves3 = async (req, res) => {
  try {
    const { projectId, owner, data } = req.body;

    uploadComponentsToS3(data, BUCKET_NAME, projectId);

    const project = await Project.findOne({
      generatedName: projectId,
      status: "active",
    })
      .select("_id")
      .lean()
      .exec();

    const user = await User.findOne({ email: owner })
      .select("_id")
      .lean()
      .exec();

    if (!project || !user) {
      return res.status(500).json({
        success: false,
        message: "User or project not found!",
      });
    }

    // Define S3 params
    const params = {
      Bucket: BUCKET_NAME,
      Key: `projects/${user._id}/${project._id}`,
      Body: data,
      ContentType: "application/json",
      CacheControl: "no-cache, no-store, must-revalidate", // Forces immediate refresh
      Expires: new Date(0), // Prevents old versions being served
    };

    // Use putObject for guaranteed overwrite
    s3.putObject(params, (error, data) => {
      if (error) {
        console.error("Error uploading to S3:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to upload project to S3.",
        });
      }

      res.json({
        success: true,
        message: "Project saved successfully!",
        url: `${BUCKET_URL}/projects/${user._id}/${project._id}`,
      });
    });

    //Invalidating cache
    invalidateCloudFront(CLOUDFRONTID, [
      `${BUCKET_URL}/projects/${user._id}/${project._id}`,
    ])
      .then(() => console.log("Invalidation successful"))
      .catch((err) => console.error("Invalidation error:", err));
  } catch (error) {
    console.error("Error saving project:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

//save text msgs
exports.saveMessage = async (req, res) => {
  try {
    const { projectId, text, role, email, image } = req.body;

    const project = await Project.findOne({
      generatedName: projectId,
      status: "active",
    });
    const user = await User.findOne({ email });
    if (!project || !user) {
      return res.status(404).json({
        success: false,
        message: "Project or User not found.",
      });
    }

    if (project.owner.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to save messages for this project.",
      });
    }

    const message = await Message.create({
      text,
      role,
      projectId: project._id,
      user: user._id,
      images: image,
    });

    //udpating the prompt count
    if (user.promptCount > 0) {
      user.promptCount = user.promptCount - 1;
      await user.save();
    }

    if (role === "user") {
      await Project.findByIdAndUpdate(project._id, {
        $set: {
          lastResponder: "user",
        },
      });
    } else {
      await Project.findByIdAndUpdate(project._id, {
        $set: {
          lastResponder: "ai",
        },
      });
    }
    console.log(message, "mess");
    res.json({
      success: true,
      message: "Message saved successfully!",
      message: message,
    });
  } catch (error) {
    console.error("Error saving message:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

//save to memory
exports.saveMemory = async (req, res) => {
  try {
    const { projectId, text, email } = req.body;

    const project = await Project.findOne({
      generatedName: projectId,
      status: "active",
    });
    const user = await User.findOne({ email: email });
    if (!project || !user) {
      return res.status(404).json({
        success: false,
        message: "Project or User not found.",
      });
    }

    await Project.findByIdAndUpdate(project._id, {
      $set: {
        memory: text,
      },
    });

    res.json({
      success: true,
      message: "Memory saved successfully!",
    });
  } catch (error) {
    console.error("Error saving memory:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

// actions
//update project name, make public/private, delete, isPinned actions
exports.updateProject = async (req, res) => {
  try {
    const { projectId, action, name, value } = req.body;
    const project = await Project.findOne({
      generatedName: projectId,
      status: "active",
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found.",
      });
    }

    const updateFields = {};

    if (action === "update-name") {
      updateFields.title = name;
    } else if (action === "make-public") {
      updateFields.isPublic = true;
    } else if (action === "make-private") {
      updateFields.isPublic = false;
    } else if (action === "delete") {
      await Project.findByIdAndUpdate(project._id, {
        $set: { status: "deleted" },
      });
      return res.json({
        success: true,
        message: "Project deleted successfully!",
      });
    } else if (action === "pin") {
      updateFields.isPinned = value;
    }

    if (Object.keys(updateFields).length > 0) {
      await Project.findByIdAndUpdate(project._id, { $set: updateFields });
    }

    res.json({
      success: true,
      message: "Project updated successfully!",
    });
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

// Load more messages with pagination (20 messages per request)
exports.loadMoreMessages = async (req, res) => {
  try {
    const { projectId, page = 0 } = req.body;
    const limit = 20; // Number of messages per page
    const skip = page * limit; // Calculate how many messages to skip

    // Find the project
    const project = await Project.findOne(
      { generatedName: projectId, status: "active" },
      { _id: 1 }
    )
      .lean()
      .exec();

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found!",
      });
    }

    // Get total count of messages for this project
    const totalMessages = await Message.countDocuments({
      projectId: project._id,
    });

    // Fetch messages with pagination
    const messages = await Message.find(
      { projectId: project._id },
      { _id: 0, __v: 0, projectId: 0 }
    )
      .sort({ createdAt: -1 }) // Newest first
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    if (messages.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No more messages found!",
      });
    }

    // Calculate if there are more messages to load
    const hasMore = totalMessages > skip + messages.length;

    res.json({
      success: true,
      messages,
      hasMore,
      totalMessages,
      currentPage: page,
    });
  } catch (error) {
    console.error("Error loading more messages:", error);
    res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
    });
  }
};

// savemessage helper
exports.saveMessageHelper = async ({
  projectId,
  email,
  text,
  role,
  image,
  plan,
}) => {
  try {
    const project = await Project.findOne({
      generatedName: projectId,
      status: "active",
    });
    const user = await User.findOne({ email });
    if (!project || !user) {
      return res.status(404).json({
        success: false,
        message: "Project or User not found.",
      });
    }

    if (project.owner.toString() !== user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to save messages for this project.",
      });
    }

    // save message
    await Message.create({
      text,
      role,
      projectId: project._id,
      user: user._id,
      images: image,
    });
    //save plan
    if (plan) {
      const cleaned = plan
        .replace(/___start___/, "")
        .replace(/___end___/, "")
        .trim();

      const urlMatch = cleaned.match(/"url":\s*"([^"]+)"/);

      if (urlMatch) {
        const img = await processImageData(urlMatch[1]);

        const newplan = new Plan({
          text: plan,
          role,
          projectId: project._id,
          user: user._id,
          images: image,
          ImagetoClone: JSON.stringify(img),
        });
        await newplan.save();
      } else {
        const newplan = new Plan({
          text: plan,
          role,
          projectId: project._id,
          user: user._id,
          images: image,
        });
        await newplan.save();
      }
    }
    //udpating the prompt count
    if (user.promptCount > 0) {
      user.promptCount = user.promptCount - 1;
      await user.save();
    }

    if (role === "user") {
      await Project.findByIdAndUpdate(project._id, {
        $set: {
          lastResponder: "user",
        },
      });
    } else {
      await Project.findByIdAndUpdate(project._id, {
        $set: {
          lastResponder: "ai",
        },
      });
    }

    return true;
  } catch (error) {
    console.log(error, "issues while saving");
    return false;
  }
};

exports.saveCode = async (req, res) => {
  const { projectId, userId, file, code } = req.body;

  try {
    if (!projectId || !userId || !file || !code) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const existingCode = await Code.findOne({ user: userId, projectId });

    if (existingCode) {
      console.log("Adding file to existing project");
      existingCode.files.push({ file, code });
      await existingCode.save();
      return res.status(200).json({ message: "Code saved successfully." });
    } else {
      console.log("Creating new code entry for project");
      await Code.create({
        projectId,
        user: userId,
        files: [{ file, code }],
      });
      return res.status(201).json({ message: "Code created successfully." });
    }
  } catch (error) {
    console.error("Error while saving code:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};
