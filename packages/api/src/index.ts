import dotenv from "dotenv";
import path from "node:path";
const envPath = path.resolve(process.cwd(), ".env");
const envResult = dotenv.config({ path: envPath });
if (envResult.error) {
  console.warn(`dotenv: failed to load .env at ${envPath}:`, envResult.error?.message);
} else {
  const parsedCount = envResult.parsed ? Object.keys(envResult.parsed).length : 0;
  console.log(`dotenv: loaded ${parsedCount} vars from ${envPath}`);
}

import cors from "cors";
import express from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { travelAssistantFlow } from "./genkit/agents/flows.js";

const app = express();
const PORT = process.env.PORT || 4000;
const CHUNK_END = "\n\n";

// Middleware
app.use(cors());
app.use(express.json());

const apiRouter = express.Router();
// Fallbacks removed: we target a single model via env `model` (default: gemini-2.5-flash-lite).

// Add request body logging middleware for debugging
apiRouter.use((req, res, next) => {
  if (req.path === "/chat" && req.method === "POST") {
    const contentType = req.headers["content-type"]?.replace(/\n|\r/g, "");
    const body =
      typeof req.body === "string"
        ? req.body.replace(/\n|\r/g, "")
        : JSON.stringify(req.body).replace(/\n|\r/g, "");
    console.log("Request Content-Type:", contentType);
    console.log("Request body:", body);
  }
  next();
});

// Health check endpoint
apiRouter.get("/health", (req, res) => {
  const googleKey =
    process.env.GOOGLE_CSE_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const googleCx =
    process.env.GOOGLE_CSE_CX ||
    process.env.GOOGLE_CUSTOM_SEARCH_CX ||
    process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  const live = Boolean(googleKey && googleCx);
  res.status(200).json({ status: "OK", webSearch: { live, keyConfigured: Boolean(googleKey), cxConfigured: Boolean(googleCx) } });
});

// MCP tools endpoint disabled (simplified mode)
apiRouter.get("/tools", async (req, res) => {
  res.status(200).json({ tools: [], message: "Tools endpoint disabled in simplified mode" });
});

// Chat endpoint with Server-Sent Events (SSE) for streaming responses
// SIMPLIFIED VERSION - No MCP tools, just basic LLM chat
// @ts-ignore - Ignoring TypeScript errors for Express route handlers
apiRouter.post("/chat", async (req, res) => {
  req.on("close", () => {
    console.log("Client disconnected, aborting...");
  });

  if (!req.body) {
    console.error(
      "Request body is undefined. Check Content-Type header in the request."
    );
    return res.status(400).json({
      error:
        "Request body is undefined. Make sure to set Content-Type to application/json.",
    });
  }

  const message = req.body.message;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    console.log("Chat request received:", message);
    // Use Genkit + Gemini via travelAssistantFlow for full orchestrated workflow
    async function* generateEvents() {
      try {
        // Run the full orchestrated workflow
        const result = await travelAssistantFlow({ query: message, days: 3 });
        
        // Combine all sections into a formatted response
        const sections = [
          "📋 **Your Preferences:**\n" + result.preferences,
          "\n\n🔍 **Research:**\n" + result.research,
          "\n\n🌍 **Recommended Destinations:**\n" + result.recommendations,
          "\n\n✈️ **Suggested Itinerary:**\n" + result.itinerary
        ];
        const content = sections.join("\n\n");

        // Simulate token streaming to the UI using small chunks
        const chunks: string[] = [];
        const step = 40; // characters per chunk
        for (let i = 0; i < content.length; i += step) {
          chunks.push(content.slice(i, i + step));
        }

        for (const c of chunks) {
          const tokenPayload = {
            chunk: {
              kwargs: {
                content: [
                  {
                    type: "output_text",
                    text: c,
                  },
                ],
              },
            },
          };
          yield {
            eventName: "llm_token",
            data: {
              agent: "TravelAssistant",
              ...tokenPayload,
            },
          };
        }

        // Final message
        yield {
          eventName: "agent_complete",
          data: {
            agent: "TravelAssistant",
            content,
          },
        };
      } catch (error: any) {
        let errMsg = error?.message || "Unknown error occurred";
        // If the model isn't found for this API version/key, suggest common alternatives
        if (typeof errMsg === "string" && /models\/.+not found/i.test(errMsg)) {
          errMsg +=
            "\nHint: This model may not be available for your API version/key. Try one of: 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b', or check your account's ListModels.";
        }
        console.error("Error in chat (TravelAssistant):", errMsg);
        console.error("Error stack:", error?.stack);
        // Normalize error as a final agent message so the UI doesn't treat it as a hard error event
        yield {
          eventName: "agent_complete",
          data: {
            agent: "TravelAssistant",
            content: `Error: ${errMsg}`,
          },
        };
      }
    }

    const context = generateEvents();

    const readableStream = new Readable({
      async read() {
        try {
          for await (const event of context) {
            const { eventName, data } = event;
            const serializedData = JSON.stringify({
              type: "metadata",
              agent: (data as any)?.agent || null,
              event: eventName,
              data: data ? JSON.parse(JSON.stringify(data)) : null,
            });
            this.push(serializedData + CHUNK_END);
            console.log("Pushed event:", serializedData);
          }
          this.push(null); // Close the stream
        } catch (error: any) {
          console.error("Error during streaming:", error?.message);
        }
      },
    });

    await pipeline(readableStream, res);
  } catch (error) {
    console.error("Error occurred:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: (error as any).message });
    } else {
      res.write(
        `${JSON.stringify({
          type: "error",
          message: (error as any).message,
        })}` + CHUNK_END
      );
      res.end();
    }
  }
});

// Genkit-powered chat endpoint (non-streaming JSON)
// Uses travelAssistantFlow for orchestrated workflow
// @ts-ignore - Ignoring TypeScript errors for Express route handlers
apiRouter.post("/v2/chat", async (req, res) => {
  if (!req.body || !req.body.message) {
    return res.status(400).json({ error: "Message is required" });
  }
  try {
    const result = await travelAssistantFlow({ query: req.body.message, days: 3 });
    const content = [
      "📋 **Your Preferences:**\n" + result.preferences,
      "\n\n🔍 **Research:**\n" + result.research,
      "\n\n🌍 **Recommended Destinations:**\n" + result.recommendations,
      "\n\n✈️ **Suggested Itinerary:**\n" + result.itinerary
    ].join("\n\n");
    return res.status(200).json({ agent: "TravelAssistant", content, sections: result });
  } catch (err: any) {
    console.error("Genkit /v2/chat error:", err?.message);
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Mount the API router with the /api prefix
app.use("/api", apiRouter);

// Add a root route for API information
app.get("/", (req, res) => {
  res.json({
    message: "AI Travel Agents API - Genkit Powered",
    version: "2.0.0",
    endpoints: {
      health: "/api/health",
      chat: "/api/chat (SSE streaming)",
      chatJson: "/api/v2/chat (JSON)",
    },
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  - Health check: http://localhost:${PORT}/api/health (GET)`);
  console.log(`  - MCP Tools: http://localhost:${PORT}/api/tools (GET)`);
  console.log(`  - Chat: http://localhost:${PORT}/api/chat (POST)`);
  // Env debug (no secrets): verify Google CSE vars visibility at runtime
  const cwd = process.cwd();
  const keyPresent = Boolean(
    process.env.GOOGLE_CSE_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_CUSTOM_SEARCH_API_KEY
  );
  const cxPresent = Boolean(
    process.env.GOOGLE_CSE_CX ||
      process.env.GOOGLE_CUSTOM_SEARCH_CX ||
      process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID
  );
  console.log(
    `Env debug -> cwd: ${cwd}, googleKeyPresent: ${keyPresent}, googleCxPresent: ${cxPresent}`
  );
});
