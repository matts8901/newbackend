const { ChatOpenAI, OpenAIEmbeddings } = require("@langchain/openai");
const { searchWeb } = require("./SearchWeb");
const { ToolNode } = require("@langchain/langgraph/prebuilt");
const {
  Annotation,
  END,
  InMemoryStore,
  MemorySaver,
  START,
  StateGraph,
} = require("@langchain/langgraph");
const { AIMessage, HumanMessage } = require("@langchain/core/messages");

// Import prompts from both systems
const { fp, Leadtest, fpfix } = require("./Prompts");

const { MODEL_API_KEY, RELICS_API_KEY } = require("../config");

const Message = require("../models/Message");
const User = require("../models/User");
const Plan = require("../models/Plan");
const Project = require("../models/Project");
const Gallery = require("../models/Gallery");

// Dynamic import to avoid circular dependency
const getSaveMessageHelper = async () => {
  try {
    const { saveMessageHelper } = require("../controllers/Projects");
    return saveMessageHelper;
  } catch (error) {
    console.warn("Could not load saveMessageHelper:", error.message);
    return null;
  }
};

// Direct OpenRouter API call for Claude models when LangChain fails
const makeDirectOpenRouterCall = async (messages, modelName) => {
  try {
    const modelMap = {
      "claude-sonnet-4": "anthropic/claude-sonnet-4",
      "claude-3.7-sonnet": "anthropic/claude-3.7-sonnet",
    };

    const openRouterModel = modelMap[modelName] || modelName;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MODEL_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://your-app.com", // Optional
          "X-Title": "Your App Name", // Optional
        },
        body: JSON.stringify({
          model: openRouterModel,
          messages: messages,
          temperature: 0.8,
          max_tokens: 4000,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter API error: ${response.status} - ${errorText}`
      );
    }

    const data = await response.json();

    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    } else {
      throw new Error("Invalid response format from OpenRouter API");
    }
  } catch (error) {
    console.error("Direct OpenRouter API call failed:", error);
    throw error;
  }
};

// Unified image processing function with compression for Claude's 5MB limit
async function processImageData(urls, format = "openai") {
  if (!urls || (Array.isArray(urls) && urls.length === 0)) {
    return [];
  }

  const imageParts = [];
  const urlArray = Array.isArray(urls) ? urls : [urls];
  const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB to stay safely under Claude's 5MB limit

  for (const url of urlArray) {
    if (!url || typeof url !== "string") {
      console.warn(`Skipping invalid image URL: ${url}`);
      continue;
    }

    try {
      console.log(`Fetching image from: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch image ${url}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      let mimeType = contentType;

      if (!contentType || !contentType.startsWith("image/")) {
        const extension = url.split(".").pop()?.toLowerCase();
        switch (extension) {
          case "jpg":
          case "jpeg":
            mimeType = "image/jpeg";
            break;
          case "png":
            mimeType = "image/png";
            break;
          case "webp":
            mimeType = "image/webp";
            break;
          case "gif":
            mimeType = "image/gif";
            break;
          default:
            console.warn(
              `Could not determine valid image MIME type for ${url}`
            );
            continue;
        }
      }

      const imageBuffer = await response.arrayBuffer();

      // Check file size first
      const currentSizeBytes = imageBuffer.byteLength;
      console.log(
        `Image size: ${(currentSizeBytes / 1024 / 1024).toFixed(2)}MB`
      );

      // Skip images that are too large (Claude has 5MB limit and 8000px dimension limit)
      if (currentSizeBytes > MAX_SIZE_BYTES) {
        console.log(
          `Image too large (${(currentSizeBytes / 1024 / 1024).toFixed(2)}MB), skipping to avoid Claude constraints...`
        );
        console.log("Skipping this image due to size/dimension constraints");
        continue;
      }

      // Convert to base64 only if size is acceptable
      const base64Data = Buffer.from(imageBuffer).toString("base64");

      // Format based on agent type
      if (format === "openai") {
        imageParts.push({
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64Data}`,
          },
        });
      } else {
        imageParts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Data,
          },
        });
      }

      console.log(`Successfully processed image: ${url}`);
    } catch (error) {
      console.error(`Error processing image URL ${url}:`, error);
    }
  }

  return imageParts;
}

// Unified LLM instance function
const getLLMInstance = (modelName, bindTools = true) => {
  const temperature = 0.2;
  const maxRetries = 3;

  // Models that don't support tool use on OpenRouter
  const modelsWithoutToolSupport = [
    "gpt-5-chat",
    "moonshotai/kimi-k2",
    "x-ai/grok-3",
  ];

  const baseConfig = {
    temperature,
    maxRetries,
    apiKey: MODEL_API_KEY,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
    },
    maxTokens: 60000,
    maxCompletionTokens: 60000,
  };

  let llm;
  let actualModelName;

  switch (modelName) {
    case "gpt-4.1":
      actualModelName = "gpt-4.1";
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: actualModelName,
        openAIApiKey: MODEL_API_KEY,
      });
      break;
    case "gpt-5-chat":
      actualModelName = "gpt-5";
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: actualModelName,
        openAIApiKey: MODEL_API_KEY,
      });
      break;
    case "kimi-k2":
      actualModelName = "moonshotai/kimi-k2";
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: actualModelName,
        openAIApiKey: MODEL_API_KEY,
      });
      break;
    case "claude-sonnet-4":
      actualModelName = "anthropic/claude-sonnet-4";
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: actualModelName,
      });
      break;
    case "claude-3.7-sonnet":
      actualModelName = "anthropic/claude-3.7-sonnet";
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: actualModelName,
      });
      break;
    case "gemini-2.5-pro":
      actualModelName = "google/gemini-2.5-pro";
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: actualModelName,
      });
      break;
    case "grok-3":
      actualModelName = "x-ai/grok-3";
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: actualModelName,
      });
      break;
    default:
      actualModelName = "gpt-4.1";
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: actualModelName,
        openAIApiKey: MODEL_API_KEY,
      });
  }

  // Only bind tools if the model supports them and bindTools is true
  const shouldBindTools =
    bindTools && !modelsWithoutToolSupport.includes(actualModelName);

  if (shouldBindTools) {
    const tools = [...searchWeb()];
    return llm.bindTools(tools);
  }

  return llm;
};

function extractMessage(input) {
  const match = input.match(
    /"filesCount"\s*:\s*\d+\s*,\s*"message"\s*:\s*"([^"]+)"/
  );
  return match ? match[1] : null;
}

function extractGeneratedFilesObjectString(rawMarkdown) {
  if (typeof rawMarkdown !== "string" || !rawMarkdown.trim()) {
    return null;
  }

  try {
    // Find the generatedFiles object in the string
    const generatedFilesMatch = rawMarkdown.match(
      /"generatedFiles":\s*({[\s\S]*?})\s*(?:,\s*"files"|$)/
    );

    if (!generatedFilesMatch) {
      return null;
    }

    // Parse just the generatedFiles object
    const generatedFilesString = generatedFilesMatch[1];
    const generatedFiles = JSON.parse(generatedFilesString);

    return generatedFiles;
  } catch (e) {
    console.log(e);
    return null;
  }
}

const processFileTree = (obj, path = "") => {
  const result = [];

  Object.entries(obj).forEach(([key, value]) => {
    // Remove leading slash if present and ensure we build the path correctly
    const cleanKey = key.startsWith("/") ? key.substring(1) : key;
    const currentPath = path ? `${path}/${cleanKey}` : cleanKey;

    if (value.code !== undefined) {
      // Ensure the path starts with 'frontend/' for proper directory structure
      const fullPath = currentPath.startsWith("frontend/")
        ? currentPath
        : `frontend/${currentPath}`;

      result.push({
        name: cleanKey.split("/").pop(), // Just the filename
        type: "file",
        contents: value.code,
        path: fullPath, // Full path like "frontend/src/components/Navbar.tsx"
      });
    } else if (typeof value === "object" && value !== null) {
      const dirEntry = {
        name: cleanKey,
        type: "directory",
        children: processFileTree(value, currentPath),
        path: currentPath,
      };
      result.push(dirEntry);
    }
  });

  return result;
};

// Memory and store setup
const memoryStore = new MemorySaver();
const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-ada-002",
  apiKey: MODEL_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

const store = new InMemoryStore({
  index: { embeddings, dims: 1536, fields: ["s"] },
});
const tools = [...searchWeb()];
const toolNode = new ToolNode(tools);

// Unified Agent State - exactly like v1/Agent.js
const UnifiedAgentState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
  }),
  usableAssets: Annotation({
    reducer: (x, y) => x.concat(y),
  }),
  user_id: Annotation(),
  plan: Annotation(),
});

// Create unified agent workflow - framework-based routing
const createUnifiedAgent = async (
  history,
  userId,
  projectId,
  plan,
  allcode,
  modelName,
  memory = null,
  cssLib = null,
  framework = null,
  images = null,
  fix,
  uid,
  pid,
  galleryImages
) => {
  // Core node - handles framework-based routing intelligently
  const coreNode = async (state) => {
    let { messages } = state;

    try {
      const llmInstance = getLLMInstance(modelName);

      const userInput =
        messages.length > 0 && messages[messages.length - 1].content
          ? String(messages[messages.length - 1].content)
          : "No user input provided";

      // const formattedPrompt = await leadPrompt.formatPromptValue({
      //   leaderPrompt: Leadtest(),
      //   userInput: String(userInput),
      //   formatInstructions: leadparser.getFormatInstructions(),
      //   conversationHistory: JSON.stringify(history),
      // });

      // const promptMessages = formattedPrompt.toChatMessages();
      const chatMessages = [
        { role: "system", content: Leadtest() },
        { role: "user", content: userInput },
      ];

      const res = await llmInstance.invoke(chatMessages);

      return {
        messages: [
          new AIMessage({
            content: JSON.stringify(res.content, null, 2),
          }),
        ],
      };
    } catch (error) {
      console.log(error, "core node");
      return {
        messages: [
          new AIMessage({
            content:
              "I encountered an error processing your request. Let's try a simpler approach.",
          }),
        ],
      };
    }
  };

  // Frontend node - exactly like v1/Agent.js
  const FrontNode = async (state) => {
    try {
      const { messages } = state;
      const llmInstance = getLLMInstance(modelName, false); // Don't bind tools for frontend
      console.log("Frontend node activated for model:", modelName, userId);

      const userInput =
        messages.length > 0 && messages[messages.length - 1].content
          ? String(messages[messages.length - 1].content)
          : "No user input provided";

      // Process images into readable base64 format
      let processedImages = [];
      if (images && images.length > 0) {
        try {
          processedImages = await processImageData(images);
          console.log(
            `Processed ${processedImages.length} images for frontend generation`
          );
        } catch (imageError) {
          console.error("Error processing images:", imageError);
        }
      }

      const chatMessages = [
        {
          role: "system",
          content: fix ? fpfix() : fp(),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${userInput} + All the Code: ${JSON.stringify(allcode)} + Previous Messages - ${JSON.stringify(history)} + Gallery Images - ${JSON.stringify(galleryImages)}`,
            },

            ...processedImages,
          ],
        },
      ];

      const res = await llmInstance.invoke(chatMessages);
      console.log(
        "Frontend LLM response received:",
        res?.content ? "Success" : "Empty"
      );

      if (!res || !res.content) {
        throw new Error("Empty response from LLM");
      }

      // message extraction
      try {
        const parsed = extractMessage(res.content);
        if (parsed) {
          const saveMessageHelper = await getSaveMessageHelper();

          saveMessageHelper({
            projectId: pid,
            email: userId,
            text: parsed,
            role: "ai",
          });
        }
      } catch (error) {
        console.log("Error saving message", error);
      }

      return {
        messages: [
          new AIMessage({
            content:
              typeof res.content === "string"
                ? res.content
                : JSON.stringify(res.content, null, 2),
          }),
        ],
      };
    } catch (error) {
      console.error("Frontend node error:", error);

      // Enhanced error handling with fallback response
      const fallbackResponse = {
        Steps:
          "Frontend development initiated - building React TypeScript application",
        role: "frontend",
        generatedFiles: {
          "frontend/package.json": {
            code: JSON.stringify(
              {
                name: "frontend-app",
                private: true,
                version: "0.0.0",
                type: "module",
                scripts: {
                  dev: "vite",
                  build: "tsc && vite build",
                  preview: "vite preview",
                },
                dependencies: {
                  react: "^18.2.0",
                  "react-dom": "^18.2.0",
                  "lucide-react": "^0.263.1",
                },
                devDependencies: {
                  "@types/react": "^18.0.28",
                  "@types/react-dom": "^18.0.11",
                  "@vitejs/plugin-react": "^3.1.0",
                  tailwindcss: "^3.2.7",
                  typescript: "^4.9.3",
                  vite: "^4.1.0",
                },
              },
              null,
              2
            ),
          },
        },
        files: ["frontend/package.json"],
        filesCount: 1,
      };

      return {
        messages: [
          new AIMessage({
            content: `___start___\n${JSON.stringify(fallbackResponse, null, 2)}\n___end___`,
          }),
        ],
      };
    }
  };

  // Build the workflow - EXACTLY like v1/Agent.js (clean, no extra nodes)
  const workflow = new StateGraph(UnifiedAgentState)
    .addNode("agent", coreNode)
    .addNode("tools", toolNode)
    .addNode("frontend", FrontNode)
    .addEdge(START, "agent")
    .addEdge("tools", "agent")
    .addEdge("agent", END)
    // Conditional routing after agent node - EXACTLY like v1/Agent.js
    .addConditionalEdges(
      "agent",
      async (state) => {
        const lastMessage = state.messages[state.messages.length - 1];
        let content = JSON.parse(lastMessage.content);

        if (typeof content === "string") {
          const nextNodeMatch = content.match(/"NextNode"\s*:\s*"([^"]+)"/);

          if (nextNodeMatch) {
            const nextNodeValue = nextNodeMatch[1];
            console.log(nextNodeValue, "forwarded to ");
            switch (nextNodeValue) {
              case "frontend":
                return "frontend";
              case "tools":
                return "tools";
              default:
                console.log("Unknown NextNode value:", nextNodeValue);
                return END;
            }
          }
        }

        return END;
      },
      ["tools", "frontend", END]
    );

  const compiledWorkflow = workflow.compile({
    checkpointer: memoryStore,
    store: store,
  });

  return compiledWorkflow;
};

// Main unified agent function
const startUnifiedAgent = async (
  prompt,
  projectId,
  userId,
  res,
  terminal = null,
  modelName,
  memory = null,
  cssLib = null,
  framework = null,
  images = null,
  fix,
  uid
) => {
  try {
    console.log(
      `Starting unified agent with framework: ${framework}, cssLib: ${cssLib},  model: ${modelName}`
    );

    const user = await User.findOne({ email: userId });

    const Proj = await Project.findOne({ generatedName: projectId });

    let allMessages = [];
    let plan = null;
    let allcode = null;

    let prevImages = [];
    let galleryImages = [];

    if (user && Proj) {
      allMessages = await Message.find({
        user: user._id.toString(),
        projectId: Proj,
      })
        .limit(10)
        .sort({ createdAt: -1 });

      const parsedPrompt = JSON.parse(Proj.enh_prompt);
      if (parsedPrompt.data) {
        prevImages = [parsedPrompt.url];
      }
      plan = await Plan.findOne({
        user: user._id.toString(),
        projectId: Proj,
      })
        .limit(1)
        .sort({ createdAt: -1 });

      if (Proj.url) {
        try {
          const response = await fetch(Proj.url);
          allcode = await response.json();
        } catch (error) {
          console.error("Error fetching code from project URL:", error);
        }
      }

      // Fetch gallery images for the project
      try {
        const galleryData = await Gallery.find({
          projectId: projectId,
          status: "active",
        })
          .select("_id label imageUrl imageName description tags")
          .sort({ createdAt: -1 })
          .limit(20); // Limit to 20 most recent images

        galleryImages = galleryData.map((img) => ({
          id: img._id,
          label: img.label,
          url: img.imageUrl,
          name: img.imageName,
          description: img.description,
          tags: img.tags,
        }));

        console.log(
          `Fetched ${galleryImages.length} gallery images for project ${projectId}:`,
          galleryImages.map((img) => ({ label: img.label, url: img.url }))
        );
      } catch (error) {
        console.error("Error fetching gallery images:", error);
        galleryImages = [];
      }
    }

    // Combine all image sources: input images, previous images, and gallery images
    let allimgs = [...images, ...prevImages];

    console.log(
      `Total images available to agent: ${allimgs.length} (input: ${images?.length || 0}, previous: ${prevImages.length}, gallery: ${galleryImages.length})`
    );

    const workflow = await createUnifiedAgent(
      allMessages,
      user.email,
      projectId,
      plan,
      allcode,
      modelName,
      memory,
      cssLib,
      framework,
      allimgs,
      fix,
      uid,
      Proj._id,
      galleryImages.map((img) => ({
        label: img.label,
        url: img.url,
      }))
    );

    const finalPrompt = JSON.stringify({
      userInput: prompt,
      terminal: terminal,
      memory,
      cssLib,
      framework,
      images: allimgs, // Include all images (input + previous + gallery)
      galleryImages: galleryImages.map((img) => ({
        label: img.label,
        url: img.url,
      })), // Specifically include gallery images for reference
    });

    const stream = workflow.streamEvents(
      {
        messages: [new HumanMessage(finalPrompt)],
        user_id: userId,
      },
      {
        version: "v1",
        configurable: { thread_id: projectId },
      }
    );

    // Stream start
    res.write(`data: stream_start\n\n`);

    let accumulatedText = "";

    for await (const chunk of stream) {
      // console.log(chunk.event);

      if (
        chunk.event === "on_chat_model_stream" ||
        chunk.event === "on_llm_stream"
      ) {
        const textChunk = chunk.data?.chunk;

        let content = "";

        if (textChunk?.text) {
          content = textChunk.text;
        }

        if (content) {
          accumulatedText += content;
          res.write(`data: ${content}\n\n`);
        }
      }
    }
    console.log(accumulatedText);
    if (accumulatedText.length === 0) {
      console.log("No content was streamed, sending default message");
      res.write(`data: I'm processing your request...\n\n`);
    }

    console.log("Unified agent stream processing complete");
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error) {
    console.error("Error in unified agent:", error);
    res.write(
      `data: Error processing your request: ${
        error instanceof Error ? error.message : "Unknown error"
      }\n\n`
    );
    res.write("data: [DONE]\n\n");
    res.end();
    throw error;
  }
};

const createPlan = async (
  input,
  images,
  memory,
  cssLibrary,
  framework,
  model
) => {
  try {
    const llmInstance = getLLMInstance(model, false); // Don't bind tools for planning

    // Step 1: Detect cloning intent and process images
    let finalImages = images || [];
    let extraImages;
    let screenshotUrl = null;
    let isCloning = false;

    // Check for cloning request
    const cloneAnalysisPrompt = `
Analyze if this is a cloning/replication request:
"${input}"

if url does not contain http/https add the protocl before passing it to url parameter strictly
json markers should not be present

Reply with JSON: {"isCloning": true/false, "url": "cloudfront_url_if_found_or_null"}`;

    const cloneAnalysisResult = await llmInstance.invoke([
      { role: "system", content: "Reply only in JSON format." },
      { role: "user", content: cloneAnalysisPrompt },
    ]);

    try {
      // Clean the response content to handle Claude's ```json ``` formatting
      let cleanContent = cloneAnalysisResult.content.trim();

      // Remove markdown code blocks that Claude models often add
      cleanContent = cleanContent
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

      // Try to extract JSON if it's wrapped in other text
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
      }
      const analysisData = JSON.parse(cleanContent);

      isCloning = analysisData.isCloning;

      if (analysisData.isCloning && analysisData.url) {
        try {
          const screenshotApiUrl = `${RELICS_API_KEY}/screenshot?url=${encodeURIComponent(analysisData.url)}`;
          const screenshotResponse = await fetch(screenshotApiUrl);

          if (screenshotResponse.ok) {
            const screenshotData = await screenshotResponse.json();

            if (screenshotData.screenshotUrl) {
              screenshotUrl = screenshotData.screenshotUrl;
              finalImages = [...finalImages, screenshotData.screenshotUrl];
            }

            if (screenshotData.html.images) {
              extraImages = screenshotData.html.images;
            }
          }
        } catch (apiError) {
          console.error("Screenshot API error:", apiError);
        }
      }
    } catch (parseError) {
      console.error("Clone analysis parse error:", parseError);
      // Fallback: assume not cloning if parsing fails
      isCloning = false;
    }

    // Step 2: Process images for visual analysis
    const processedImages = await processImageData(finalImages);
    const limitedImages = processedImages.slice(0, 2); // Limit for context

    // Step 3B: Create model-specific planning prompt with professional output
    const getModelSpecificPrompt = (modelName, isCloning) => {
      const baseContext = `
PROJECT REQUEST: ${input}
CONTEXT MEMORY: ${memory || "None provided"}
CSS FRAMEWORK: ${cssLibrary || "Tailwind CSS"}  
FRONTEND FRAMEWORK: ${framework || "React"}
REPLICATION MODE: ${isCloning ? "Yes - Clone existing design" : "No - Original development"}
URL SOURCE: ${screenshotUrl ? "CloudFront CDN URL - This is a screenshot image hosted on AWS CloudFront" : "No URL provided"}

CRITICAL CONSTRAINTS:
- FRONTEND FOCUS: Emphasize UI components and frontend logic heavily
- NO BACKEND TECHNOLOGIES: Avoid WebSockets, WebRTC, server-side rendering, or real-time features
- MINIMAL BACKEND: Use only simple REST APIs for basic data operations if absolutely necessary
- CLIENT-SIDE EMPHASIS: Focus on React components, state management, and browser APIs`;

      // Enhanced model-specific prompts with professional output requirements
      switch (modelName) {
        case "claude-sonnet-4":
        case "claude-3.7-sonnet":
          return `${baseContext}

As an expert frontend architect, ${isCloning ? "analyze the provided visual references to create a PIXEL-PERFECT replication strategy. Your goal is to recreate the EXACT layout, functionality, styling, and user experience using FRONTEND-ONLY technologies." : "design a frontend-focused development architecture"}. 
${
  isCloning
    ? `CRITICAL CLONING REQUIREMENTS (FRONTEND-ONLY):
- EXACT Layout Replication: Match every spacing, alignment, and positioning detail using CSS/React
- FRONTEND Functionality: Recreate all interactive elements, animations, and behaviors with React/JS only
- PRECISE Styling: Match colors, fonts, shadows, borders, and visual effects exactly using CSS
- COMPONENT Analysis: Break down every UI element for perfect React component reconstruction
- RESPONSIVE Behavior: Ensure the clone works identically across all device sizes
- NO BACKEND DEPENDENCIES: Use mock data, localStorage, or static JSON files only`
    : "DELIVERABLES REQUIRED (FRONTEND-FOCUSED):"
}
${
  !isCloning
    ? `1. Frontend Architecture: React component hierarchy and file organization (PRIMARY FOCUS)
2. UI/UX Implementation: Detailed component design and interaction patterns (HEAVY EMPHASIS)
3. Design System: Typography, color schemes, and spacing standards for frontend
4. Frontend Features: Client-side functionality and user experience elements (MAIN FOCUS)
5. Minimal Backend: Only basic REST endpoints if absolutely necessary (MINIMAL)`
    : ""
}

FRONTEND-ONLY CONSTRAINTS:
- NO WebSockets, WebRTC, or real-time communication features
- NO complex server-side logic or backend-heavy features
- Focus 90% on React components, state management, and UI logic
- Use client-side storage and mock data for development
- Emphasize CSS animations, React hooks, and browser APIs

RESPONSE FORMAT - Return clean JSON without markdown formatting:
{
  "description": "${isCloning ? "Detailed frontend-only analysis of the target design with exact replication specifications" : "Comprehensive frontend-focused project overview"}",
  "features": [${isCloning ? '"Frontend-only layout replication with precise CSS measurements", "React component-based interactive functionality", "Perfect color and typography matching with CSS", "Responsive design using CSS Grid/Flexbox", "Client-side data management with localStorage"' : '"Frontend Feature 1: React component with detailed UI logic", "Frontend Feature 2: CSS animation and interaction patterns", "Frontend Feature 3: Client-side state management"'}],
  "frontendFiles": ["src/components/Header.tsx", "src/pages/Home.tsx", "src/hooks/useLocalStorage.ts", "src/data/mockData.json"],
  "backendRoutes": [${isCloning ? "" : '{"method": "GET", "path": "/api/basic-data", "purpose": "Simple data endpoint (minimal backend)"}'}],
  "brandKit": {"primaryFont": "font-name", "colorPalette": {"primary": "#hex", "secondary": "#hex"}, "spacing": "design-system"},
  "url": "${screenshotUrl || ""}"${isCloning ? ',\n  "replicationSpecs": {"layoutStructure": "exact CSS positioning and spacing details", "visualElements": ["every React component with precise specifications"], "stylingApproach": "CSS-only implementation for perfect visual match", "functionalityCloning": "React hooks and component-based behavior replication", "responsiveCloning": "CSS Grid/Flexbox device-specific adaptations", "dataStrategy": "client-side mock data and localStorage"}' : ""}
}`;

        case "gemini-2.5-pro":
          return `${baseContext}

As a senior frontend technical lead specializing in multimodal analysis, ${isCloning ? "examine the visual references to create PIXEL-PERFECT frontend-only replication specifications. Your mission is to achieve EXACT visual and functional duplication using React and CSS only." : "architect a frontend-focused development solution"}.

${
  isCloning
    ? `EXACT CLONING SPECIFICATIONS (FRONTEND-ONLY):
- PRECISE Layout Matching: Replicate every pixel, margin, padding, and alignment exactly using CSS
- FRONTEND Functionality Duplication: Mirror all interactions, animations, and user flows with React/JS
- PERFECT Visual Fidelity: Match colors, typography, shadows, gradients, and effects precisely with CSS
- REACT Component Mapping: Identify and recreate every UI element as React components
- RESPONSIVE Behavior: Ensure perfect adaptation across all screen sizes using CSS Grid/Flexbox
- NO BACKEND DEPENDENCIES: Use mock data, localStorage, and client-side logic only`
    : "FRONTEND-FOCUSED SPECIFICATIONS:"
}
${
  !isCloning
    ? `- Frontend Structure: Complete React component architecture with file paths (PRIMARY FOCUS)
- UI/UX Implementation: Detailed component design and interaction patterns (HEAVY EMPHASIS)
- Design Standards: Typography hierarchy, color systems, and spacing tokens for frontend
- Frontend Features: Client-side functionality with React hooks and state management (MAIN FOCUS)
- Minimal Backend: Only basic REST endpoints if absolutely necessary (MINIMAL SCOPE)`
    : ""
}

FRONTEND-ONLY CONSTRAINTS:
- NO WebSockets, WebRTC, or real-time communication features
- NO complex server-side logic or backend-heavy implementations
- Focus 90% on React components, CSS styling, and client-side interactions
- Use localStorage, sessionStorage, and mock data for data needs
- Emphasize CSS animations, React state management, and browser APIs

OUTPUT SPECIFICATION - Provide clean JSON without code block markers:
{
  "description": "${isCloning ? "Comprehensive frontend-only visual analysis with exact replication methodology" : "Frontend-focused technical project summary"}",
  "features": [${isCloning ? '"Frontend-only layout replication with exact CSS measurements", "React component-based functionality duplication", "Precise visual matching using CSS and styled-components", "Responsive behavior using CSS Grid/Flexbox", "Client-side data management with React hooks"' : '"Frontend Feature 1 with React implementation details", "UI Feature 2 with CSS animation and interaction patterns"'}],
  "frontendFiles": ["src/components/specific-component.tsx", "src/pages/specific-page.tsx", "src/hooks/useClientData.ts", "src/data/mockData.json"],
  "backendRoutes": [${isCloning ? "" : '{"method": "GET", "path": "/api/simple-data", "purpose": "Basic data endpoint (minimal backend)"}'}],
  "brandKit": {"typography": "font specifications", "colors": ["#primary", "#secondary"], "designTokens": "spacing and sizing system"},
  "url": "${screenshotUrl || ""}"${isCloning ? ',\n  "visualAnalysis": {"componentBreakdown": ["every React component with exact specifications"], "layoutSystem": "precise CSS Grid/Flexbox structure with measurements", "interactionPatterns": "React-based user experience flows and CSS animations", "visualCloning": "pixel-perfect CSS styling and component structure", "responsiveCloning": "CSS media queries and responsive design patterns", "dataStrategy": "client-side mock data and localStorage implementation"}' : ""}
}`;

        case "grok-3":
          return `${baseContext}

As a pragmatic frontend development strategist, ${isCloning ? "analyze the target design to create an EXACT FRONTEND-ONLY CLONING blueprint. Your mission is to achieve PERFECT replication using React and CSS only." : "create a practical frontend-focused development roadmap"}.

${
  isCloning
    ? `EXACT CLONING REQUIREMENTS (FRONTEND-ONLY):
- PERFECT Layout Matching: Replicate every pixel, spacing, alignment using CSS Grid/Flexbox
- FRONTEND Functionality Duplication: Mirror all interactions, animations, hover effects with React/JS
- PRECISE Visual Replication: Match colors, typography, shadows, borders using CSS/styled-components
- REACT Component Analysis: Break down every UI element into reusable React components
- CLIENT-SIDE User Experience: Ensure the clone behaves exactly like the original using frontend tech
- NO BACKEND DEPENDENCIES: Use mock data, localStorage, and client-side logic exclusively`
    : "FRONTEND-FOCUSED DELIVERABLES:"
}
${
  !isCloning
    ? `- React Component Architecture: Logical file structure with clear component responsibilities (PRIMARY)
- UI/UX Implementation: Detailed frontend patterns and interaction design (HEAVY FOCUS)
- Design Foundation: Consistent typography, colors, and spacing systems for frontend (MAIN)
- Frontend Features: Client-side functionality with React hooks and state management (CORE)
- Minimal Backend: Only basic REST endpoints if absolutely necessary (MINIMAL)`
    : ""
}

FRONTEND-ONLY CONSTRAINTS:
- NO WebSockets, WebRTC, or real-time communication features
- NO complex server-side logic or backend-heavy implementations
- Focus 90% on React components, CSS styling, and client-side logic
- Use localStorage, sessionStorage, and static JSON for data needs
- Emphasize CSS animations, React hooks, and browser APIs

STRUCTURED OUTPUT - Return pure JSON without formatting:
{
  "description": "${isCloning ? "Comprehensive frontend-only cloning strategy with exact replication methodology" : "Strategic frontend-focused project overview"}",
  "features": [${isCloning ? '"Frontend-only layout replication with exact CSS pixel measurements", "React component-based functionality duplication", "Precise visual matching using CSS and React styling", "Client-side user experience across all device sizes", "localStorage-based data management"' : '"Frontend Feature 1 with React implementation and user benefit", "UI Feature 2 with CSS animation and interaction value"'}],
  "frontendFiles": ["src/components/practical-component.tsx", "src/pages/user-page.tsx", "src/hooks/useLocalData.ts", "src/data/staticData.json"],
  "backendRoutes": [${isCloning ? "" : '{"method": "GET", "path": "/api/basic-resource", "purpose": "Simple data endpoint (minimal backend)"}'}],
  "brandKit": {"fontSystem": "typography choices", "colorScheme": {"brand": "#hex", "accent": "#hex"}, "spacingScale": "consistent measurements"},
  "url": "${screenshotUrl || ""}"${isCloning ? ',\n  "cloneStrategy": {"designApproach": "frontend-only pixel-perfect replication", "keyComponents": ["every React component with exact specifications"], "implementationOrder": "strategic frontend development sequence", "layoutCloning": "exact CSS positioning and spacing replication", "functionalityCloning": "complete React-based interaction and behavior duplication", "dataStrategy": "client-side localStorage and mock data implementation"}' : ""}
}`;

        case "kimi-k2":
          return `${baseContext}

As a meticulous frontend system architect, ${isCloning ? "perform detailed analysis of the visual references for EXACT FRONTEND-ONLY REPLICATION. Your mission is to achieve PERFECT pixel-level accuracy using React and CSS exclusively." : "design comprehensive frontend-focused development specifications"}.

${
  isCloning
    ? `EXACT CLONING SPECIFICATIONS (FRONTEND-ONLY):
- PERFECT Layout Matching: Replicate every pixel, spacing, alignment using CSS Grid/Flexbox precisely
- FRONTEND Functionality Duplication: Mirror all interactions, animations, hover effects with React/JS
- PRECISE Visual Replication: Match colors, typography, shadows, borders using CSS/styled-components
- REACT Component Analysis: Break down every UI element into detailed React component specifications
- RESPONSIVE Behavior: Ensure perfect adaptation across all screen sizes using CSS media queries
- CLIENT-SIDE ONLY: Use mock data, localStorage, and browser APIs exclusively`
    : "FRONTEND-FOCUSED REQUIREMENTS:"
}
${
  !isCloning
    ? `1. Frontend Organization: Structured React component hierarchy with clear file paths (PRIMARY)
2. UI/UX Architecture: Complete component specification with interaction documentation (HEAVY FOCUS)
3. Design System: Detailed typography, color theory, and spacing methodology for frontend (MAIN)
4. Frontend Features: Comprehensive client-side functionality with React hooks (CORE FOCUS)
5. Minimal Backend: Basic REST endpoints only if absolutely necessary (MINIMAL SCOPE)`
    : ""
}

FRONTEND-ONLY CONSTRAINTS:
- NO WebSockets, WebRTC, or real-time communication features
- NO complex server-side logic or backend-heavy implementations
- Focus 90% on React components, CSS styling, and client-side interactions
- Use localStorage, sessionStorage, and static JSON for all data needs
- Emphasize CSS animations, React state management, and browser APIs

JSON RESPONSE - Provide clean JSON structure:
{
  "description": "${isCloning ? "Meticulous frontend-only replication analysis with exact implementation specifications" : "Detailed frontend-focused technical specification and methodology"}",
  "features": [${isCloning ? '"Frontend-only layout replication with exact CSS pixel measurements", "React component-based functionality duplication", "Precise visual matching using CSS and styled-components", "Responsive behavior using CSS Grid/Flexbox", "Client-side data management with React hooks and localStorage"' : '"Detailed Frontend Feature 1 with React specifications", "Complex UI Feature 2 with CSS animation requirements"'}],
  "frontendFiles": ["src/components/detailed-component.tsx", "src/pages/structured-page.tsx", "src/hooks/useClientStorage.ts", "src/data/mockData.json"],
  "backendRoutes": [${isCloning ? "" : '{"method": "GET", "path": "/api/minimal-endpoint", "purpose": "Basic data endpoint (minimal backend)"}'}],
  "brandKit": {"fontFamily": "specific font choices", "colorSystem": {"primary": "#hex", "secondary": "#hex", "neutral": "#hex"}, "spacingRules": "mathematical spacing system"},
  "url": "${screenshotUrl || ""}"${isCloning ? ',\n  "replicationDetails": {"structuralAnalysis": "exact CSS layout breakdown with measurements", "componentMapping": ["precise React component mapping with specifications"], "stylingPrecision": "exact CSS specifications for perfect visual match", "functionalityCloning": "complete React-based interaction and behavior duplication", "responsiveCloning": "CSS media queries and responsive design patterns", "dataStrategy": "client-side localStorage and mock data implementation"}' : ""}
}`;

        default: // gpt-4.1 and fallback
          return `${baseContext}

As a comprehensive frontend software architect, ${isCloning ? "analyze the provided visual references to create EXACT FRONTEND-ONLY REPLICATION specifications. Your mission is to achieve PERFECT pixel-level accuracy using React and CSS exclusively." : "design a complete frontend-focused development blueprint"}.

${
  isCloning
    ? `EXACT CLONING REQUIREMENTS (FRONTEND-ONLY):
- PERFECT Layout Matching: Replicate every pixel, spacing, alignment using CSS Grid/Flexbox exactly
- FRONTEND Functionality Duplication: Mirror all interactions, animations, hover effects with React/JS
- PRECISE Visual Replication: Match colors, typography, shadows, borders using CSS/styled-components
- REACT Component Analysis: Break down every UI element into detailed React component specifications
- RESPONSIVE Behavior: Ensure perfect adaptation across all screen sizes using CSS media queries
- CLIENT-SIDE ONLY: Use mock data, localStorage, and browser APIs exclusively`
    : "FRONTEND-FOCUSED DELIVERABLES:"
}
${
  !isCloning
    ? `- Frontend Architecture: Complete React component structure with organized file paths (PRIMARY FOCUS)
- UI/UX Implementation: Detailed component design and interaction patterns (HEAVY EMPHASIS)
- Design System: Professional typography, color palette, and spacing standards for frontend (MAIN)
- Frontend Features: Detailed client-side functionality with React hooks and state management (CORE)
- Minimal Backend: Basic RESTful API endpoints only if absolutely necessary (MINIMAL SCOPE)`
    : ""
}

FRONTEND-ONLY CONSTRAINTS:
- NO WebSockets, WebRTC, or real-time communication features
- NO complex server-side logic or backend-heavy implementations
- Focus 90% on React components, CSS styling, and client-side interactions
- Use localStorage, sessionStorage, and static JSON for all data needs
- Emphasize CSS animations, React hooks, and browser APIs

PROFESSIONAL OUTPUT - Return clean JSON without markdown:
{
  "description": "${isCloning ? "Comprehensive frontend-only replication analysis with exact implementation specifications" : "Comprehensive frontend-focused project analysis with technical architecture overview"}",
  "features": [${isCloning ? '"Frontend-only layout replication with exact CSS pixel measurements", "React component-based functionality duplication", "Precise visual matching using CSS and styled-components", "Responsive behavior using CSS Grid/Flexbox", "Client-side data management with React hooks and localStorage"' : '"Primary Frontend Feature 1 with React implementation and business value", "Secondary UI Feature 2 with CSS animations and user experience details"'}],
  "frontendFiles": ["src/components/ProfessionalComponent.tsx", "src/pages/UserExperiencePage.tsx", "src/hooks/useClientData.ts", "src/data/mockData.json"],
  "backendRoutes": [${isCloning ? "" : '{"method": "GET", "path": "/api/basic-resource", "purpose": "Simple data endpoint (minimal backend)"}'}],
  "brandKit": {"typography": {"primary": "font-family", "hierarchy": "size scale"}, "colors": {"brand": "#hex", "ui": "#hex", "text": "#hex"}, "spacing": "systematic measurements", "designPrinciples": "consistency and accessibility"},
  "url": "${screenshotUrl || ""}"${isCloning ? ',\n  "visualReplication": {"layoutAnalysis": "exact CSS structural breakdown with measurements", "componentLibrary": ["every reusable React component with specifications"], "stylingFramework": "precise CSS architecture for perfect match", "responsiveStrategy": "CSS media queries and responsive design patterns", "functionalityCloning": "complete React-based interaction and behavior duplication", "dataStrategy": "client-side localStorage and mock data implementation"}' : ""}
}`;
      }
    };

    // Step 4: Choose the appropriate prompting function based on framework
    const planningPrompt = getModelSpecificPrompt(model, isCloning);

    const messageContent = [
      { type: "text", text: planningPrompt },
      ...limitedImages,
    ];

    // First LLM call - Generate detailed plan with Claude-specific error handling
    let planResult;
    try {
      planResult = await llmInstance.invoke([
        {
          role: "system",
          content: `You are a ${model} planning specialist. Generate precise JSON responses for ${isCloning ? "visual replication" : "development planning"}.`,
        },
        {
          role: "user",
          content: messageContent,
        },
      ]);
    } catch (invokeError) {
      console.error("LLM invoke error:", invokeError);

      // For Claude models, try direct API call as fallback
      if (model.includes("claude")) {
        console.log("Attempting direct API call for Claude model...");
        try {
          const directResponse = await makeDirectOpenRouterCall(
            [
              {
                role: "system",
                content: `You are a ${model} planning specialist. Generate precise JSON responses for ${isCloning ? "visual replication" : "development planning"}.`,
              },
              {
                role: "user",
                content: Array.isArray(messageContent)
                  ? messageContent
                      .map((msg) =>
                        msg.type === "text" ? msg.text : "[Image]"
                      )
                      .join("\n")
                  : messageContent,
              },
            ],
            model
          );
          planResult = { content: directResponse };
        } catch (directError) {
          console.error("Direct OpenRouter API call also failed:", directError);
          throw new Error(
            `Claude model failed: ${invokeError.message}. Direct API also failed: ${directError.message}`
          );
        }
      } else {
        throw invokeError;
      }
    }

    // Validate planResult structure
    if (!planResult || (!planResult.content && !planResult.message)) {
      throw new Error(
        `Invalid response from ${model}. Expected content or message property.`
      );
    }

    // Extract content from response (handle both .content and .message properties)
    const planContent = planResult.content || planResult.message || planResult;

    // Second LLM call - Extract title with error handling
    const titlePrompt = `Based on this plan, generate a 2-4 word project title:
${planContent}

Reply with ONLY the title (no quotes, no extra text).`;

    let titleResult;
    try {
      titleResult = await llmInstance.invoke([
        { role: "system", content: "Generate concise project titles only." },
        { role: "user", content: titlePrompt },
      ]);
    } catch (titleError) {
      console.error("Title generation error:", titleError);

      // For Claude models, try direct API call as fallback for title too
      if (model.includes("claude")) {
        console.log(
          "Attempting direct API call for Claude title generation..."
        );
        try {
          const directTitleResponse = await makeDirectOpenRouterCall(
            [
              {
                role: "system",
                content: "Generate concise project titles only.",
              },
              { role: "user", content: titlePrompt },
            ],
            model
          );
          titleResult = { content: directTitleResponse };
        } catch (directTitleError) {
          console.error(
            "Direct Claude title API call also failed:",
            directTitleError
          );
          titleResult = { content: "New Project" };
        }
      } else {
        // Fallback title if title generation fails
        titleResult = { content: "New Project" };
      }
    }

    // Extract title content safely
    const titleContent =
      titleResult.content ||
      titleResult.message ||
      titleResult ||
      "New Project";
    const projectTitle = titleContent.toString().trim().replace(/['"]/g, "");

    // Step 4: Robust JSON parsing to handle different model outputs
    let planData;
    let rawContent = planContent;

    // Clean the content from different model formatting inconsistencies
    let cleanedContent = rawContent;

    // Remove markdown code blocks that some models add
    cleanedContent = cleanedContent
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "");

    // Remove any leading/trailing whitespace
    cleanedContent = cleanedContent.trim();

    // Try to extract JSON if it's wrapped in other text
    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedContent = jsonMatch[0];
    }

    try {
      planData = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error(
        "Plan parsing error, attempting alternative parsing methods"
      );

      // Try to fix common JSON issues
      try {
        // Fix trailing commas and other common issues
        let fixedContent = cleanedContent
          .replace(/,(\s*[}\]])/g, "$1") // Remove trailing commas
          .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Add quotes to unquoted keys
          .replace(/:\s*'([^']*)'/g, ': "$1"'); // Replace single quotes with double quotes

        planData = JSON.parse(fixedContent);
      } catch (secondParseError) {
        console.error("Secondary parsing failed, using raw content");
        planData = {
          rawPlan: rawContent,
          description: `Analysis of: ${input}`,
          features: [
            "Core functionality implementation",
            "User interface development",
            "Backend API integration",
          ],
        };
      }
    }

    // Professional plan formatting without emojis
    let formattedPlan = "";

    // Add project description if available
    if (planData.description) {
      formattedPlan += `\n${planData.description}\n\n`;
    }

    if (extraImages) {
      formattedPlan += `\nEXTRA IMAGES FOUND:\n`;
      extraImages.forEach((image) => {
        formattedPlan += `${image.alt} - ${image.src}\n`;
      });
    }

    // Add features section with proper object handling
    if (planData.features && Array.isArray(planData.features)) {
      formattedPlan += "FEATURES:\n";
      planData.features.forEach((feature, index) => {
        let featureText = "";

        if (typeof feature === "string") {
          featureText = feature;
        } else if (typeof feature === "object" && feature !== null) {
          // Handle feature objects that some models (like Gemini) might return
          if (feature.name && feature.description) {
            featureText = `${feature.name}: ${feature.description}`;
          } else if (feature.title && feature.details) {
            featureText = `${feature.title}: ${feature.details}`;
          } else if (feature.feature && feature.implementation) {
            featureText = `${feature.feature}: ${feature.implementation}`;
          } else {
            // Extract all key-value pairs from the object
            const entries = Object.entries(feature).map(
              ([key, value]) => `${key}: ${value}`
            );
            featureText = entries.join(" - ");
          }
        } else {
          featureText = String(feature);
        }

        formattedPlan += `${index + 1}. ${featureText}\n`;
      });
      formattedPlan += "\n";
    }

    // Add frontend architecture
    if (planData.frontendFiles && Array.isArray(planData.frontendFiles)) {
      // Ensure all elements in frontendFiles are properly formatted
      planData.frontendFiles = planData.frontendFiles.map((file) => {
        if (typeof file === "string") {
          return file;
        } else if (file && typeof file === "object") {
          return file.name || file.path || file.filename || String(file);
        } else {
          return String(file);
        }
      });

      const sectionTitle = "ARCHITECTURE:";
      formattedPlan += `${sectionTitle}\n`;

      // Standard frontend architecture formatting
      planData.frontendFiles.forEach((file) => {
        // Ensure file is a string before processing
        const fileName =
          typeof file === "string"
            ? file
            : file?.name || file?.path || String(file);
        formattedPlan += `- ${fileName}\n`;
      });
    }
    formattedPlan += "\n";

    // Fallback content if no structured data is available
    if (!formattedPlan.trim()) {
      formattedPlan =
        planData.rawPlan ||
        rawContent ||
        `Professional development plan for: ${input}


Comprehensive software solution designed to meet specified requirements with modern architecture and best practices.

FEATURES:
1. User interface development with responsive design
2. Backend API implementation with secure endpoints
3. Database integration with optimized queries
4. Authentication and authorization system

ARCHITECTURE:
- src/components/App.tsx
- src/pages/HomePage.tsx
- src/components/common/Header.tsx


DESIGN SYSTEM:
- Typography: Modern sans-serif font family
- Color Scheme: Professional color palette
- Spacing System: Consistent measurement scale`;
    }

    // Extract URL from model response or use screenshot URL
    let finalUrl = screenshotUrl || "";

    // Check if the model provided a URL in its response
    if (planData && planData.url && planData.url.trim() !== "") {
      finalUrl = planData.url;
    }

    // If still no URL but we have a screenshot URL, use that
    if (!finalUrl && screenshotUrl) {
      finalUrl = screenshotUrl;
    }

    const finalResponse = {
      title: projectTitle,
      message: "Should I continue with this plan?",
      plan: formattedPlan.trim(),
      url: finalUrl,
    };

    console.log("Final createPlan response:", finalResponse);
    return finalResponse;
  } catch (error) {
    console.error("Error in createPlan:", error);

    return {
      title: "Development Plan",
      message: "Should I continue with this plan?",
      plan: `📋 PROJECT: ${input}\n\n📁 FRONTEND FILES:\n• src/components/App.tsx\n• src/pages/Home.tsx\n\n🔗 BACKEND ROUTES:\n• GET /api/health - Health check\n\n🎨 BRAND KIT:\n• Font: Inter\n• Colors: Primary #3B82F6\n• Spacing: Tailwind default`,
      url: "",
    };
  }
};

module.exports = {
  startUnifiedAgent,
  createUnifiedAgent,
  processImageData,
  getLLMInstance,
  createPlan,
};
