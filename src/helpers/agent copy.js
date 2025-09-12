const {
  ChatOpenAI,
  OpenAIEmbeddings,
  AzureChatOpenAI,
} = require("@langchain/openai");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { StructuredOutputParser } = require("@langchain/core/output_parsers");
const {
  Annotation,
  END,
  InMemoryStore,
  MemorySaver,
  START,
  StateGraph,
} = require("@langchain/langgraph");
const {
  AIMessage,

  HumanMessage,
} = require("@langchain/core/messages");

const { z } = require("zod");

const getSaveMessageHelper = async () => {
  try {
    const { saveMessageHelper } = require("../controllers/Projects");
    return saveMessageHelper;
  } catch (error) {
    console.warn("Could not load saveMessageHelper:", error.message);
    return null;
  }
};

async function processImageData(urls) {
  if (!urls || (Array.isArray(urls) && urls.length === 0)) {
    return []; // Return empty array if no URLs provided
  }

  const imageParts = [];
  // Ensure urls is always an array
  const urlArray = Array.isArray(urls) ? urls : [urls];

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

      // Determine MIME type
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.startsWith("image/")) {
        // Try to infer from URL extension if content-type is missing/invalid
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
          // Add more cases if needed
          default:
            console.warn(
              `Could not determine valid image MIME type for ${url}. Content-Type: ${contentType}. Skipping.`
            );
            continue; // Skip if we can't determine a valid image type
        }
        console.warn(`Using inferred MIME type ${inferredMimeType} for ${url}`);
        mimeType = inferredMimeType;
      } else {
        mimeType = contentType;
      }

      // Get image data as ArrayBuffer and convert to Base64
      const imageBuffer = await response.arrayBuffer();
      const base64Data = Buffer.from(imageBuffer).toString("base64");

      imageParts.push({
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      });
      console.log(`Successfully processed image: ${url}`);
    } catch (error) {
      console.error(`Error processing image URL ${url}:`, error);
      // Decide if you want to stop or just skip the image
      // For now, we just log the error and continue
    }
  }

  return imageParts;
}

// leader node
const OutputSchema = z.object({
  action: z.string().describe("The action to be taken, e.g., 'user guidance'"),
  Steps: z
    .string()
    .describe("The main content of the explanation or related suggestion."),
  role: z.literal("ai").describe("The role of the responder, always 'ai'"),
  generatedFiles: z
    .record(
      z.string(),
      z.object({
        code: z.string(),
      })
    )
    .describe("A mapping of file paths to their content."),
  files: z
    .array(z.string())
    .describe("List of generated or modified file paths."),
  filesCount: z
    .number()
    .describe("Total number of files generated or modified."),
});

// Define the routing response schema
const RoutingSchema = z.object({
  NextNode: z.enum(["tools", "agent"]).describe("The next node to route to"),
  user_message: z.string().describe("The original user message"),
});

// Union schema for both response types
const LOutputSchema = z.union([OutputSchema, RoutingSchema]);

const nameSchema = z.object({
  projectName: z.string().describe("the name of the project"),
  message: z
    .string()
    .describe("one liner message given to user at the end of the project"),
  summary: z.string().describe("3-4 line summary of the project"),
  features: z
    .array()
    .describe(
      "a 3 pointer list of features that input does not contain but are fundamental and can be instantly implemented"
    ),
  theme: z
    .string()
    .describe(
      "the theme of the project containing - color combo of evey element and the vibe of the project - color codes, font styles, should be creative unless its a clone of anykind or an image is given"
    ),
});

const MainPrompt = () => `
You are an expert AI Agent designed to create high-quality, interactive web-based 3D games, Framer Motion animations expert, and frontend applications, primarily using React (JSX) and Tailwind CSS. Your purpose is to generate exceptionally accurate, visually stunning, professionally themed, pixel-perfect, functionally robust, highly maintainable, secure, performant, and fully realized JavaScript code for games, animations, and frontend UIs. 
You have three primary jobs:
(1) fix or modify code strictly according to user input and memory
(2) generate complete, error-free code for all files specified in a provided plan in a single response, starting file generation immediately without unnecessary preamble, strictly adhering to user input, memory, specified framework, CSS library, and plan details, without omitting any code or including unnecessary console logs unless required for debugging.
(3) Attach prebuilt backend and login when possible

## Core Responsibilities

1. **Intent Detection**: Analyze user intent through reasoning, not keyword matching.
   - Conversational or general queries: Respond with a clear explanation and suggest a small game or animation idea using the "explanation" format.
   - Creation, replication, or building requests (games, animations, or frontend apps): Start generating complete code for all files in one go immediately, strictly based on the provided plan or user prompt, ensuring pixel-perfect accuracy for cloning tasks.
   - Code fixing/modification: Start fixing or modifying code immediately, strictly according to user input and memory, ensuring no deviations.
2. **Plan Adherence**: Immediately generate code for all files in a single response, precisely implementing all features, themes, colors, and functionality specified in the provided plan or user prompt. If no plan is provided, infer requirements from the prompt and memory, using web search if needed.
3. **Web Tools**: Use web search to gather context, inspiration, or references for games/animations. Capture screenshots when requested, returning CloudFront URLs.
4. **No Unnecessary Questions**: Only seek clarification for unclear requests or malformed URLs.
5. **Code Fixes**: Start fixing or modifying code immediately based on user input and memory, ensuring consistency with prior context.
6. Write error free json.
7. You can write as long codes as you like.
8. Never forget to import a component and always use correct imports.
9. ProjectId will be given use it perfectly.

## Capabilities

- **Frontend**: React (Hooks, Context, JSX, default), Tailwind CSS (default)
- **Animations**: Framer Motion for smooth, professional animations
- **Game Development**: React-based game libraries (e.g., React-Three-Fiber for 3D, canvas-based games avoiding SVGs)
- **Features**: Authentication, mobile-responsive UI, file upload
- **Web Tools**: Web search, website reading, screenshot capture (returning CloudFront URLs)
- **Icon Library**: Use \`lucide-react\` or \`react-icons\` for React projects
- **Image Sourcing**: Use web tools to get CloudFront URLs or https://picsum.photos for images
- **Backend** Using a prebuilt backend and apis.

## Behavioral Rules

1. **Code Quality**:
   - Generate syntactically correct, error-free, secure, performant, and maintainable JavaScript (.js only, unless .jsx explicitly requested).
   - Ensure responsive, SEO-friendly, multi-component UIs with professional aesthetics (minimalist default or pixel-perfect for cloning).
   - Use \`lucide-react\` or \`react-icons\` for icons in React projects, adding to \`package.json\` as "latest".
   - Avoid SVGs, base64 images, or external image sources (except https://picsum.photos).
   - For cloning, achieve pixel-perfect accuracy in visuals, functionality, and component count, matching fonts, colors, layouts, and features.
   - Structure code in multiple components for maintainability, even for simple requests.
   - Avoid unnecessary console logs unless explicitly requested for debugging.
   - Start generating all files specified in the plan immediately in a single response, ensuring no code is omitted.

2. **URL Validation**:
   - If a URL is malformed (e.g., missing TLD, invalid format):
     - Respond with the "explanation" format: "This URL seems incorrect. Would you like me to continue anyway?"
   - If a URL resembles a well-known domain but is misspelled (e.g., 'gooogle.com'):
     - Respond with the "explanation" format: "The URL 'gooogle.com' seems to refer to 'google.com'. Do you want me to continue using 'google.com' instead?"
     - Proceed only after user confirmation.

3. **Default Stack**:
   - Frontend: React (JSX) + Tailwind CSS
   - Animation: Framer Motion
   - Only use a different stack if explicitly requested.
   - Prebuilt Backend APIs and Login

4. **Code Generation**:
   - For fixes: Start modifying code immediately based on user input and memory, ensuring consistency and no deviations.
   - For generation: Start generating complete code for all files specified in the plan immediately in a single response, using the requested framework and CSS library, ensuring all specified features are implemented without omissions.
   - For cloning, use web search or provided references to replicate visuals and functionality exactly.
   - Ensure correct imports/exports, valid JSON in \`package.json\`, and no runtime errors.
   - Conduct a final audit to verify theme, features, and functionality match the plan or prompt.
   - Package.json must only contain dependencies and devDependencies.
   - App.js is the root file in case of React, make sure to import everything correctly.
   
5. **Code Modification**
   - If the code is given analyze and understand the full code, then understand userInput then given only the modified files in output as per the user request.

6. **Pre-built backend**
   - To use the prebuilt database in a project and save data these are the set of APIs with schema to send and recieve data from-
      
   DATABASE API DOCUMENTATION

The database system allows storing, retrieving, updating, and deleting structured data records within projects. Each record has a type (category) and data (content). All operations require user authentication and project authorization.

=== API ENDPOINTS ===

1. ADD RECORD - POST /d/add
   Purpose: Create a new database record
   Input: { "projectId": "string", "email": "string", "type": "string", "data": "string" }
   Output: { "success": true, "message": "DB added successfully" }
   Description: Adds a new record with specified type and data content. User must be authorized for the project.

2. GET RECORD - POST /d/getdata  
   Purpose: Retrieve a specific record by type and data match
   Input: { "projectId": "string", "email": "string", "type": "string", "data": "string" }
   Output: { "success": true, "data": { "_id": "string", "projectId": "string", "type": "string", "data": "string", "createdAt": "date", "updatedAt": "date" } }
   Description: Finds and returns the exact record that matches both type and data fields.

3. UPDATE RECORD - POST /d/update
   Purpose: Modify an existing record by ID
   Input: { "projectId": "string", "email": "string", "id": "string", "type": "string" (optional), "data": "string" (optional) }
   Output: { "success": true, "message": "Record updated successfully" }
   Description: Updates specified fields of a record identified by its unique ID. Only provided fields are updated.

4. DELETE RECORD - POST /d/delete
   Purpose: Remove a record by type and data match
   Input: { "projectId": "string", "email": "string", "type": "string", "data": "string" }
   Output: { "success": true, "message": "DB record deleted successfully", "deletedRecord": { "id": "string", "type": "string", "data": "string" } }
   Description: Finds and deletes the exact record that matches both type and data fields.

5. LIST RECORDS - POST /d/getdb
   Purpose: Retrieve multiple records with pagination
   Input: { "projectId": "string", "email": "string", "from": number (default: 1), "to": number (default: 10) }
   Output: { "success": true, "records": [array of record objects] }
   Description: Returns paginated list of all records in the project, sorted by creation date (newest first).

=== AUTHENTICATION & AUTHORIZATION ===
- All endpoints require valid "email" and "projectId" and are given.
- You will get the user email from localstorage "token" parameter.
- User must exist in the system and be authorized for the specified project
- Project must exist and user must be in the project's subusers array

=== ERROR RESPONSES ===
- 400: Missing required parameters or invalid input
- 403: User unauthorized for project access
- 404: Project not found or Record not found
- 500: Internal server error

=== DATA MODEL ===
Record Structure: { "_id": "auto-generated", "projectId": "string", "type": "string", "data": "string", "createdAt": "auto-timestamp", "updatedAt": "auto-timestamp" }

=== USAGE PATTERNS ===
- Use ADD to create new records with type/data
- Use GET to retrieve specific records by type/data match
- Use UPDATE to modify records by their unique ID
- Use DELETE to remove records by type/data match
- Use LIST to browse all records with pagination

All operations are logged for audit purposes and include automatic timestamp management.

7. **Prebuilt Login** for making a user login make him go to mallow.dev/login?p=[projectId]&&redirect=[currenturl]
  - after login we the API will return a param named "r" in url - [currenturl]/r?=[id] - and this is id will be stored in localstorage and will be used to trigger the usercheck api to verify the user.

8. For checking if user is logged in trigger
  - POST [API]/d/user-check
  - Input: {
            "email": "john@example.com",
            "projectId": "abc123"
            }
  - Output: {
  "success": true,
  "user": {
    "_id": "65a1b2c3d4e5f6789012345",
    "email": "john@example.com",
    "status": "active",
    "createdAt": "2025-01-08T10:30:00.000Z"
  }
}

9. **API** is https://cloud.mallow.dev/api

10. ***___start___ and ___end___ markers are always required in the output.***

11. Don't write anything in html file and all the css will be in the form of tailwind only.

12. Always use prebuilt login -> mallow.dev/login?p=[projectId]&&redirect=[currenturl]

## Output Schema
\`\`\`json
___start___
{
  "Steps": "(If generating files): Planning actions after deep analysis:\n1. Analyzing the request to understand the goal: [Briefly state interpreted goal, e.g., create a game or animation].\n2. Immediately generating all files in one go, ensuring professional quality, maintainability, security, performance, responsiveness, multi-component structure, theme consistency (minimalist default or pixel-perfect clone), JS ONLY, React conventions, and error-free code/imports/exports.\n3. Creating component X at [path], focusing on [e.g., game logic, Framer animation, or UI].\n4. Creating related component Y at [path] to structure the UI/game/animation, ensuring [quality goals].\n5. Modifying main component A at [path] to import/render X and Y.\n6. Updating /package.json for dependencies like 'framer-motion' or 'lucide-react', ensuring valid JSON.\n(If fixing code): Fixing code based on user input and memory:\n1. Analyzing the request: [User's modification request].\n2. Immediately modifying file X at [path] to address [specific issue or change].\n3. Ensuring consistency with memory and user input.\n(If Refusal Required): Communicating refusal after analysis:\n1. Analyzing the request: [User's Idea].\n2. However, this request is incompatible because [e.g., 'non-web tasks are not supported'].\n3. Therefore, I cannot fulfill this request.\n4. Suggesting alternatives: [e.g., a JS-based game or animation].",
  "generatedFiles": {
  "/components/GameComponent.js": {
  "code": "import React from 'react';\n\nimport { motion } from 'framer-motion'; // Example Framer Motion import\n\nimport { CheckCircle } from 'lucide-react'; // Example icon import\n\nfunction GameComponent() {\n\n  return (\n\n    <motion.div className='p-6 bg-white rounded-lg shadow-md' animate={{ scale: 1 }} initial={{ scale: 0 }}>\n\n      <CheckCircle className='text-green-500 mr-3' size={20} />\n\n      <h3 className='text-lg font-semibold text-gray-800'>Game Component</h3>\n\n    </motion.div>\n\n  );\n\n}\n\nexport default GameComponent;"
},

   "/package.json": {
  "code": "{\n\n  \"dependencies\": {\n\n    \"react\": \"^18.2.0\",\n\n    \"react-dom\": \"^18.2.0\",\n\n    \"framer-motion\": \"latest\",\n\n    \"lucide-react\": \"latest\"\n\n  },\n\n  \"devDependencies\": {\n\n    \"tailwindcss\": \"latest\"\n\n  }\n\n}"
}
  },
  "files": [
    "/components/GameComponent.js",
    "/package.json"
  ],
  "filesCount": 2,
  "message":"End Message to user e.g - I have done {task}"
}
___end___
\`\`\`
`;

const namePromptText = () => `
You are a precise, context-aware naming and description generator for frontend projects, games, animations, and UI kits.  
Your task is to deeply analyze the user's input description (and visual context if provided) to extract the **main purpose and action of the project**.

## Process:
1. **Extract the exact core intent** of the user's request in 1-2 words (e.g., "weather dashboard", "clicker game", "profile card UI").
2. The final output must be a **valid JSON object string**.  
   - All keys and string values must use double quotes.
   - No comments or trailing commas.
   - No multiline strings — break long sentences properly.
   - The entire output must be strictly valid JSON, ready for parsing.

3. Based on that, generate:

- **projectName**: An expressive, stylish, and context-aware name (2–5 words) that hints at what the project does or feels like.
- **message**: A one-sentence engaging description of what the project offers or enables.
- **summary**: A 2–3 sentence overview explaining what the project does, who it’s for, and how it works.
- **features**: A bullet list (3–5) of key features or fundamental aspects of the project, beginner-friendly.
- **theme**: A description of the visual or conceptual theme (e.g., "Clean dashboard UI", "Retro arcade animation", "Neon card flip") including color palette and font suggestions if appropriate. If cloning is requested, make it an exact replica with all visual and UX details.

## Constraints:
- No generic starter phrases like “Create a” or “Develop a”.
- No unrelated, abstract, or generic names.
- All content must be **context-specific** and directly reflect the extracted intent.
- Avoid full stops in projectName.
- Ensure JSON validity in every output.

## Important rule
- if an image is given and user intent is to clone, then analyze the image and make sure to fill up all the details correctly according to the image.

## Example:

**User input**: "A React clicker game with score counter"  
**Extracted intent**: "clicker game"

** Strict Output Format **
  Project Name: [Generated Project Name]
        Message: [Generated Confirmation Message]
        Project Summary: [Generated Summary]
        Features:
        1. [Feature 1]
        2. [Feature 2]
        3. [Feature 3]
        4. [Optional Feature 4]
        5. [Optional Feature 5]
        Theme: [Generated Theme Guidelines]

Always follow this exact structure and formatting for every request.
`;

function extractMessage(input) {
  const match = input.match(
    /"filesCount"\s*:\s*\d+\s*,\s*"message"\s*:\s*"([^"]+)"/
  );
  return match ? match[1] : null;
}

const { MODEL_API_KEY, MODEL_NAME } = require("../config");

const Message = require("../models/Message");
const User = require("../models/User");

const Project = require("../models/Project");
const axios = require("axios");

// embeddingsf
const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-ada-002",
  apiKey: MODEL_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

// memory
const memory = new MemorySaver();

// long-term memory
const store = new InMemoryStore({
  index: { embeddings, dims: 1536, fields: ["s"] },
});

const getLLMInstance = (modelName = "gpt-4.1", bindTools = true) => {
  const temperature = 0.2;
  const maxRetries = 3;

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
  switch (modelName) {
    case "gpt-4.1":
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: "gpt-4.1",
        openAIApiKey: MODEL_API_KEY,
      });
      break;
    case "kimi-k2":
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: "moonshotai/kimi-k2",
        openAIApiKey: MODEL_API_KEY,
      });
      break;
    case "claude-sonnet-4":
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: "anthropic/claude-sonnet-4",
      });
      break;
    case "claude-3.7-sonnet":
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: "anthropic/claude-3.7-sonnet",
      });
      break;
    case "gemini-2.5-pro":
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: "google/gemini-2.5-pro",
      });
      break;
    case "grok-3":
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: "x-ai/grok-3",
      });
      break;
    default:
      llm = new ChatOpenAI({
        ...baseConfig,
        modelName: "gpt-4.1",
        openAIApiKey: MODEL_API_KEY,
      });
  }

  return llm;
};
const AgentState = Annotation.Root({
  messages: Annotation(),
  needsImages: Annotation(),
  imageQuery: Annotation(),
  fetchedImages: Annotation(),
  user_id: Annotation(),
});

// Leader prompt template
const leadPrompt = ChatPromptTemplate.fromMessages([
  ["system", `{leaderPrompt}\n\n{formatInstructions}`],
  [
    "human",
    "All Messages - {conversationHistory}\n\nCurrent Message - {userInput}\n\nCurrentCode - {Code}\n\nProjectId - {ProjectId}",
  ],
]);

const leadparser = StructuredOutputParser.fromZodSchema(LOutputSchema);
const nameparser = StructuredOutputParser.fromZodSchema(nameSchema);

// Name generate template
const NamePrompt = ChatPromptTemplate.fromMessages([
  ["system", `{namePrompt}\n\n{formatInstructions}`],
  ["human", "images - {inputImages}\n\nUser input - {userInput}"],
]);

const createAgent = async (
  history,
  userId,
  projectId,
  code,
  modelName = "gpt-4.1",
  images,
  res // Pass response object for streaming updates
) => {
  // Helper function to check if user prompt needs images
  const needsImages = (userInput) => {
    const imageKeywords = [
      "image",
      "photo",
      "picture",
      "visual",
      "graphic",
      "illustration",
      "background",
      "hero",
      "banner",
      "gallery",
      "portfolio",
      "screenshot",
      "design",
      "ui",
      "interface",
      "mockup",
      "template",
      "landing page",
      "website",
      "app",
      "dashboard",
      "profile",
      "card",
      "component",
    ];

    const lowerInput = userInput.toLowerCase();
    return (
      imageKeywords.some((keyword) => lowerInput.includes(keyword)) ||
      lowerInput.includes("show") ||
      lowerInput.includes("display") ||
      lowerInput.includes("create") ||
      lowerInput.includes("build")
    );
  };

  // Extract search query from user input
  const extractImageQuery = (userInput) => {
    const cleanInput = userInput
      .toLowerCase()
      .replace(/create|build|make|show|display|add|include/g, "")
      .replace(/image|photo|picture/g, "")
      .trim();

    const words = cleanInput
      .split(" ")
      .filter(
        (word) =>
          word.length > 2 &&
          !["the", "and", "for", "with", "from"].includes(word)
      );

    return words.slice(0, 3).join(" ") || "modern design";
  };

  const coreNode = async (state) => {
    let { messages, res } = state; // Extract res from state
    console.log(state, "state");

    try {
      const llmInstance = getLLMInstance(modelName);

      const userInput =
        messages.length > 0 && messages[messages.length - 1].content
          ? String(messages[messages.length - 1].content)
          : "No user input provided";

      const conversationHistory = history.map((item) => ({
        text: item.text,
        role: item.role,
      }));

      // Parse userInput to check for any provided image URLs
      let parsedInput;
      let userInputText;
      let providedImageUrls = [];
      try {
        parsedInput = JSON.parse(userInput);
        userInputText = parsedInput.userInput || userInput;
        if (parsedInput.images || images) {
          providedImageUrls = parsedInput.images || images || [];
        }
      } catch (e) {
        parsedInput = { userInput };
        userInputText = userInput;
      }

      const formattedPrompt = await leadPrompt.formatPromptValue({
        leaderPrompt: MainPrompt(),
        userInput: String(userInput),
        formatInstructions: leadparser.getFormatInstructions(),
        conversationHistory: JSON.stringify(conversationHistory),
        Code: code,
        ProjectId: projectId,
      });

      const promptMessages = formattedPrompt.toChatMessages();
      const aiResponse = await llmInstance.invoke(promptMessages);

      // Save message if successful
      if (aiResponse.content) {
        console.log(aiResponse.content, "aiResponse.content");
        try {
          const parsed = extractMessage(aiResponse.content);
          if (parsed) {
            const saveMessageHelper = await getSaveMessageHelper();
            saveMessageHelper({
              projectId: projectId,
              email: userId,
              text: parsed,
              role: "ai",
            });
          }
        } catch (error) {
          console.log("Error saving message", error);
        }
      }

      // Check if we need to fetch images (only if no images provided)
      const shouldFetchImages =
        needsImages(userInputText) && providedImageUrls.length === 0;
      const imageQuery = shouldFetchImages
        ? extractImageQuery(userInputText)
        : null;

      console.log(shouldFetchImages, "shouldFetchImages");
      console.log(imageQuery, "imageQuery");

      return {
        messages: [
          new AIMessage({
            content: JSON.stringify(aiResponse.content, null, 2),
          }),
        ],
        needsImages: shouldFetchImages,
        imageQuery: imageQuery,
        res: res, // Pass res object forward
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
        needsImages: false,
        imageQuery: null,
        res: res,
      };
    }
  };

  const fetchImagesNode = async (state) => {
    const query = state.imageQuery || "modern design";
    console.log(` Fetching images for query: "${query}"`);

    // Stream status to frontend
    if (res) {
      res.write(`data: [status]  Searching for images...\n\n`);
    }

    try {
      const results = await fetchImages(query, (update) => {
        if (!res) return;

        if (update.type === "status") {
          res.write(`data: [status] ${update.msg}\n\n`);
        } else if (update.type === "image") {
          // Send individual image data to frontend
          res.write(`data: [image] ${JSON.stringify(update.data)}\n\n`);
          res.write(
            `data: [status] Found image: ${update.data.snippet || "Relevant image"}\n\n`
          );
        } else if (update.type === "final") {
          res.write(`data: [status] ${update.msg}\n\n`);
        } else if (update.type === "error") {
          res.write(`data: [status] ${update.msg}\n\n`);
        }
      });

      if (!results || results.length === 0) {
        if (res) {
          res.write(`data: [status] No images found for "${query}"\n\n`);
        }
        return { fetchedImages: [] };
      }

      // Send final results summary
      if (res) {
        res.write(
          `data: [status]  Successfully fetched ${results.length} images from Unsplash\n\n`
        );
        res.write(`data: [images_complete] ${JSON.stringify(results)}\n\n`);
      }

      return {
        messages: [
          new AIMessage({
            content: `Found ${results.length} relevant images for "${query}"`,
            metadata: { type: "images", query: query, count: results.length },
          }),
        ],
        fetchedImages: results,
      };
    } catch (error) {
      console.error("Image fetch error:", error);
      if (res) {
        res.write(
          `data: [status] Failed to fetch images: ${error.message}\n\n`
        );
      }
      return { fetchedImages: [] };
    }
  };
  // Routing function to determine next step
  const routeDecision = (state) => {
    if (state.needsImages) {
      return "fetchImages";
    }
    return END;
  };

  // Create the workflow with conditional routing
  const workflow = new StateGraph(AgentState)
    .addNode("agent", coreNode)
    .addNode("fetchImages", fetchImagesNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", routeDecision, {
      fetchImages: "fetchImages",
      [END]: END,
    })
    .addEdge("fetchImages", END);

  const compiledWorkflow = workflow.compile({
    checkpointer: memory,
    store: store,
  });

  return compiledWorkflow;
};

// Enhanced fetchImages function with better streaming updates
async function fetchImages(query, onUpdate) {
  const UNSPLASH_ACCESS_KEY =
    process.env.UNSPLASH_ACCESS_KEY ||
    "RvfFaE1E5LvxpoJSIbJLzWl3GLLJ-0HMRaD4tGdchk4";

  if (!UNSPLASH_ACCESS_KEY) {
    const error =
      "Unsplash API key missing - please configure UNSPLASH_ACCESS_KEY";
    if (onUpdate) {
      onUpdate({ type: "error", msg: error });
    }
    throw new Error(error);
  }

  console.log(` Fetching images for query: "${query}"`);

  try {
    if (onUpdate) {
      onUpdate({
        type: "status",
        msg: ` Searching Unsplash for "${query}" images...`,
      });
    }

    const imgRes = await axios.get("https://api.unsplash.com/search/photos", {
      params: {
        query,
        per_page: 5,
        orientation: "landscape",
        order_by: "relevant",
      },
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
    });

    const results = [];

    if (imgRes.data && imgRes.data.results && imgRes.data.results.length > 0) {
      for (let i = 0; i < imgRes.data.results.length; i++) {
        const img = imgRes.data.results[i];

        const resource = {
          type: "image",
          id: img.id,
          link: img.urls.small,
          full: img.urls.full,
          regular: img.urls.regular,
          snippet: img.alt_description || img.description || `${query} image`,
          photographer: img.user.name,
          photographerUrl: img.user.links.html,
          width: img.width,
          height: img.height,
          downloadUrl: img.links.download_location,
        };

        results.push(resource);
        console.log(`Found image ${i + 1}: ${resource.snippet}`);

        // Send incremental updates
        if (onUpdate) {
          onUpdate({
            type: "image",
            data: resource,
          });
        }

        // Small delay for smoother streaming
        await new Promise((r) => setTimeout(r, 200));
      }

      if (onUpdate) {
        onUpdate({
          type: "final",
          msg: ` Successfully fetched ${results.length} high-quality images for "${query}" from Unsplash`,
        });
      }
    } else {
      const msg = `⚠️ No images found for "${query}" on Unsplash`;
      if (onUpdate) {
        onUpdate({ type: "status", msg });
      }
    }

    return results;
  } catch (err) {
    const errorMsg = `Failed to fetch images from Unsplash: ${err.message}`;
    console.error("Image fetch error:", err);

    if (onUpdate) {
      onUpdate({ type: "error", msg: errorMsg });
    }

    // Don't throw - return empty array to allow workflow to continue
    return [];
  }
}

const agent = async (
  prompt,
  memory,
  cssLib = "tailwindcss",
  framework = "react",
  images,
  projectId,
  userId,
  res,
  modelName = "gpt-4.1"
) => {
  try {
    const user = await User.findOne({ email: userId });
    const Proj = await Project.findOne({
      generatedName: projectId,
      status: "active",
    });

    const allMessages = await Message.find({
      user: user._id.toString(),
      projectId: Proj,
    })
      .limit(10)
      .sort({ createdAt: -1 });

    let currentCode;
    if (Proj.url) {
      const codeRes = await axios.get(Proj.url);
      currentCode = codeRes.data;
    }

    // Create workflow with response object for streaming
    const workflow = await createAgent(
      allMessages,
      user.email,
      projectId,
      currentCode,
      modelName,
      images,
      res // Pass response object for image tool streaming
    );

    const finalPrompt = JSON.stringify({
      userInput: `prompt-${prompt}, css-tailwindcss, framework-react`,
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

    let accumulatedText = "";
    let hasStreamedContent = false;

    for await (const chunk of stream) {
      if (
        chunk.event === "on_chat_model_stream" ||
        chunk.event === "on_llm_stream"
      ) {
        const textChunk = chunk.data?.chunk;
        let content = "";

        if (textChunk?.agent?.messages && textChunk.agent.messages.length > 0) {
          const message = textChunk.agent.messages[0];
          if (typeof message === "string") {
            content = message;
          } else if (typeof message === "object") {
            content = message.content || JSON.stringify(message);
          }
        } else if (textChunk?.content) {
          content = textChunk.content;
        } else if (textChunk?.text) {
          content = textChunk.text;
        } else if (typeof textChunk === "string") {
          content = textChunk;
        } else if (textChunk) {
          try {
            content = JSON.stringify(textChunk);
          } catch (e) {
            console.log("Could not stringify chunk", e);
          }
        }

        if (content) {
          accumulatedText += content;
          res.write(`data: ${content}\n\n`);
          hasStreamedContent = true;
        }
      }
    }

    if (!hasStreamedContent) {
      console.log("No content was streamed, sending fallback");
      res.write(`data: ✨ Processing completed\n\n`);
    }

    console.log("Stream processing complete");

    res.end();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Agent error:", error);

    res.write(`data: [status] Error: ${errorMessage}\n\n`);
    res.write("data: [status] [DONE]\n\n");
    res.end();
    throw error;
  }
};

const generateDetails = async ({
  input,
  memory,
  images,
  cssLib,
  framework,
  model,
}) => {
  try {
    const llmInstance = getLLMInstance(model);

    // For generateDetails, use simple approach without image processing
    // The Unsplash tool handles image fetching separately in the workflow
    const formattedPrompt = await NamePrompt.formatPromptValue({
      namePrompt: namePromptText(),
      userInput: String(JSON.stringify({ input, memory, cssLib, framework })),
      formatInstructions: nameparser.getFormatInstructions(),
      inputImages: images
        ? "Images provided via Unsplash URLs"
        : "No images provided",
    });

    const promptMessages = formattedPrompt.toChatMessages();
    const response = await llmInstance.invoke(promptMessages);

    return response.content;
  } catch (error) {
    console.error("Error in generateDetails:", error);
    throw error;
  }
};

module.exports = { agent, createAgent, generateDetails };
