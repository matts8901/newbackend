const { tool } = require("@langchain/core/tools");
const { z } = require("zod");
const axios = require("axios"); // Add axios import
const { RELICS_API_KEY } = require("../config");

const imageSearchSchema = z.object({
  query: z.string().min(1, { message: "Query is required" }),
  engine: z.enum(["yahoo", "duckduckgo"]).optional(),
});
const webSearchSchema = z.object({
  query: z.string().min(1, { message: "Query is required" }),
  engine: z.enum(["yahoo", "duckduckgo"]).optional(),
});
const webScreenshotSchema = z.object({
  url: z.string().min(1, { message: "Query is required" }),
});

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
        inlineData: {
          mimeType: mimeType,
          data: base64Data,
        },
      });
    } catch (error) {
      console.error(`Error processing image URL ${url}:`, error);
    }
  }

  return imageParts;
}

const createSearchImageTool = () => {
  return tool(
    async function webSearchImages({ query, engine = "yahoo" }) {
      try {
        const response = await axios.get(
          `${RELICS_API_KEY}/search/images?query=${encodeURIComponent(query)}`
        ); // Use axios.get

        if (response.status !== 200) {
          throw new Error(`API responded with status: ${response.status}`);
        }

        const data = response.data; // Axios response.data
        const results = Array.isArray(data.results) ? data.results : [];

        const cloudfrontUrl = results[0].cloudFrontUrl;
        const ImageforAiToReadOnly = await processImageData(
          results[0].cloudFrontUrl
        );

        return {
          success: true,
          engine,
          query,
          results,
          ImageforAiToReadOnly: JSON.stringify(ImageforAiToReadOnly),
          count: results.length,
          cloudfrontUrl,
        };
      } catch (error) {
        return {
          success: false,
          engine,
          error: error instanceof Error ? error.message : "Image search failed",
        };
      }
    },
    {
      name: "WebSearchImages",
      description: "Search an image from web",
      schema: imageSearchSchema,
    }
  );
};

// const createNonUrlGeneralWebSearchTool = () => {
//   return tool(
//     async function webSearchResults({ query }) {
//       try {
//         const response = await axios.get(
//           `${NEXT_PUBLIC_RELICS_API}/search?query=${encodeURIComponent(query)}`
//         ); // Use axios.get

//         if (response.status !== 200) {
//           throw new Error(`API responded with status: ${response.status}`);
//         }

//         const data = response.data; // Axios response.data
//         const results = Array.isArray(data.results‘results) ? data.results : [];

//         return {
//           success: true,
//           results,
//         };
//       } catch (error) {
//         return {
//           success: false,
//           error: error instanceof Error ? error.message : "Image search failed",
//         };
//       }
//     },
//     {
//       name: "WebSearch",
//       description: "Search web for results with query",
//       schema: webSearchSchema,
//     }
//   );
// };

const createWebScreenshotandReadWebsiteTool = () => {
  return tool(
    async function webScreenshotResults({ url }) {
      try {
        const response = await axios.get(
          `${RELICS_API_KEY}/screenshot?url=${encodeURIComponent(url)}`
        ); // Use axios.get

        if (response.status !== 200) {
          throw new Error(`API responded with status: ${response.status}`);
        }

        const data = response.data; // Axios response.data
        const screenshotUrl = data.screenshotUrl;
        const html = data.html;

        const screenshot = await processImageData(screenshotUrl);

        return {
          ImageforAiToReadOnly: JSON.stringify(screenshot),
          success: true,
          cloudfrontUrl: screenshotUrl,
          html,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Image search failed",
        };
      }
    },
    {
      name: "WebScreenShotAndReadWebsiteTool",
      description:
        "Take full page screenshot of a website and read it's content and html",
      schema: webScreenshotSchema,
    }
  );
};

const searchWeb = () => {
  return [
    createSearchImageTool(),
    // createNonUrlGeneralWebSearchTool(),
    createWebScreenshotandReadWebsiteTool(),
  ];
};

module.exports = { searchWeb };
