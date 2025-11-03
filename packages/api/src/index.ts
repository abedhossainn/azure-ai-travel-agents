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
import { 
  travelAssistantFlow, 
  webSearchStructuredFlow,
  customerQueryFlow,
  destinationRecommendationFlow,
  itineraryPlanningFlow,
  webSearchFlow
} from "./genkit/agents/flows.js";

const app = express();
const PORT = process.env.PORT || 4000;
const CHUNK_END = "\n\n";

// Helper function to extract number of days from query
function extractDays(query: string): number {
  const patterns = [
    /(\d+)\s*days?/i,
    /(\d+)\s*day\s*trip/i,
    /(\d+)[-\s]*day/i,
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      const days = parseInt(match[1], 10);
      if (days >= 1 && days <= 14) {
        return days;
      }
    }
  }
  
  return 3; // default to 3 days if not specified
}

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
        const days = extractDays(message);
        const result = await travelAssistantFlow({ query: message, days });
        
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
    const days = extractDays(req.body.message);
    const result = await travelAssistantFlow({ query: req.body.message, days });
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

// Research endpoint: returns structured research JSON (activities, flights, hotels)
// @ts-ignore - Ignoring TypeScript errors for Express route handlers
apiRouter.post("/research", async (req, res) => {
  const message = req.body?.message || req.body?.query || req.query?.q;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }
  try {
    const result = await webSearchStructuredFlow({ query: message });
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("/api/research error:", err?.message);
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Mount the API router with the /api prefix
app.use("/api", apiRouter);

// OpenAI-compatible Chat Completions route for third-party UIs (Assistant UI, LibreChat, etc.)
// Non-streaming version. Can be extended to SSE streaming if needed.
const openAIRouter = express.Router();

// List models endpoint - required by Open WebUI and other OpenAI-compatible clients
openAIRouter.get("/models", (req, res) => {
  const now = Math.floor(Date.now() / 1000);
  res.status(200).json({
    object: "list",
    data: [
      {
        id: "travel-agent",
        object: "model",
        created: now,
        owned_by: "travel-agents",
        permission: [],
        root: "travel-agent",
        parent: null,
      },
    ],
  });
});

// @ts-ignore - Ignoring TypeScript errors for Express route handlers
openAIRouter.post("/chat/completions", async (req, res) => {
  try {
    const { messages = [], model = "travel-agent", stream = false } = req.body || {};
    // Find the latest user message
    const userMsg = Array.isArray(messages)
      ? [...messages].reverse().find((m: any) => m?.role === "user" && m?.content)
      : undefined;
    const content = (userMsg?.content || "").toString().trim();
    if (!content) {
      return res.status(400).json({ error: { message: "No user message content provided." } });
    }

    // Extract number of days
    const days = extractDays(content);
    
    if (stream) {
      // Streaming response with real-time reasoning
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const chatId = "chatcmpl_" + Math.random().toString(36).slice(2);
      const now = Math.floor(Date.now() / 1000);

      const writeChunk = (content: string) => {
        const chunk = {
          id: chatId,
          object: "chat.completion.chunk",
          created: now,
          model,
          choices: [
            {
              index: 0,
              delta: { content },
              finish_reason: null,
            },
          ],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      };

      try {
        const chunkSize = 80;
        
        // 1. Understanding phase
        writeChunk("**Understanding Your Request**\n");
        writeChunk(`> Detected trip duration: **${days} day${days > 1 ? 's' : ''}**\n`);
        writeChunk(`> Query: "${content.slice(0, 80)}..."\n\n`);

        // 2. REAL-TIME: Extract preferences
        writeChunk("**Step 1/4: Analyzing Your Preferences**\n");
        writeChunk("> Running AI analysis...\n");
        const prefStart = Date.now();
        const prefsRes = await customerQueryFlow({ query: content });
        const preferences = prefsRes?.content ?? "";
        const prefTime = ((Date.now() - prefStart) / 1000).toFixed(1);
        writeChunk(`> Analysis complete (${prefTime}s)\n\n`);

        writeChunk("### Your Travel Preferences\n\n");
        for (let i = 0; i < preferences.length; i += chunkSize) {
          writeChunk(preferences.slice(i, i + chunkSize));
          await new Promise(resolve => setTimeout(resolve, 25));
        }

        // Extract destination from preferences for next steps
        const destMatch = /Destination:\s*([^\n]+)/i.exec(preferences);
        const destination = destMatch ? destMatch[1].trim() : "your destination";
        const monthMatch = /Month:\s*([^\n]+)/i.exec(preferences);
        const month = monthMatch ? monthMatch[1].trim() : undefined;

        // 3. REAL-TIME: Research
        writeChunk("\n\n---\n\n**Step 2/4: Researching Travel Options**\n");
        writeChunk(`> Searching for: ${destination}${month ? ' in ' + month : ''}...\n`);
        writeChunk("> Checking flights, hotels, and activities...\n");
        const researchStart = Date.now();
        const researchRes = await webSearchStructuredFlow({ 
          query: content, 
          destination: destMatch ? destMatch[1].trim() : undefined,
          month 
        });
        const research = researchRes?.summary ?? "";
        const researchTime = ((Date.now() - researchStart) / 1000).toFixed(1);
        writeChunk(`> Research complete (${researchTime}s)\n\n`);

        writeChunk("### Research Insights\n\n");
        for (let i = 0; i < research.length; i += chunkSize) {
          writeChunk(research.slice(i, i + chunkSize));
          await new Promise(resolve => setTimeout(resolve, 25));
        }

        // 4. REAL-TIME: Recommendations
        writeChunk("\n\n---\n\n**Step 3/4: Generating Destination Recommendations**\n");
        writeChunk("> Evaluating best destinations based on your preferences...\n");
        const recStart = Date.now();
        const recPrompt = `Based on the preferences and research below, recommend 3 travel destinations. For each, include a rationale, 2 pros, and 1 con.\n\nPreferences:\n${preferences}\n\nResearch:\n${research}`;
        const recRes = await destinationRecommendationFlow({ prompt: recPrompt });
        const recommendations = recRes?.content ?? "";
        const recTime = ((Date.now() - recStart) / 1000).toFixed(1);
        writeChunk(`> Recommendations ready (${recTime}s)\n\n`);

        writeChunk("### Recommended Destinations\n\n");
        for (let i = 0; i < recommendations.length; i += chunkSize) {
          writeChunk(recommendations.slice(i, i + chunkSize));
          await new Promise(resolve => setTimeout(resolve, 25));
        }

        // 5. REAL-TIME: Itinerary
        writeChunk("\n\n---\n\n**Step 4/4: Creating Your Personalized Itinerary**\n");
        writeChunk(`> Planning ${days}-day schedule for ${destination}...\n`);
        writeChunk("> Optimizing daily activities and transit routes...\n");
        const itinStart = Date.now();
        const itinRes = await itineraryPlanningFlow({ destination, days });
        const itinerary = itinRes?.content ?? "";
        const itinTime = ((Date.now() - itinStart) / 1000).toFixed(1);
        writeChunk(`> Itinerary finalized (${itinTime}s)\n\n`);

        writeChunk("### Your Day-by-Day Itinerary\n\n");
        for (let i = 0; i < itinerary.length; i += chunkSize) {
          writeChunk(itinerary.slice(i, i + chunkSize));
          await new Promise(resolve => setTimeout(resolve, 25));
        }

        // Final summary
        const totalTime = ((Date.now() - prefStart) / 1000).toFixed(1);
        writeChunk("\n\n---\n\n");
        writeChunk(`**Complete!** Your ${days}-day ${destination} trip plan is ready.\n`);
        writeChunk(`Total processing time: ${totalTime}s\n\n`);
        writeChunk("**Ask me to:**\n");
        writeChunk("- Adjust the itinerary\n");
        writeChunk("- Add specific activities\n");
        writeChunk("- Change destinations\n");
        writeChunk("- Get more details on any aspect\n");

        // Send final chunk
        const finalChunk = {
          id: chatId,
          object: "chat.completion.chunk",
          created: now,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      } catch (err: any) {
        console.error("/v1/chat/completions streaming error:", err?.message);
        writeChunk(`\n\n**Error occurred:** ${err?.message || "Internal error"}\n`);
        const finalChunk = {
          id: chatId,
          object: "chat.completion.chunk",
          created: now,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    } else {
      // Non-streaming response (original behavior)
      const result = await travelAssistantFlow({ query: content, days });
      const sections = [
        "**Your Preferences:**\n" + (result.preferences || ""),
        "\n\n**Research:**\n" + (result.research || ""),
        "\n\n**Recommended Destinations:**\n" + (result.recommendations || ""),
        "\n\n**Suggested Itinerary:**\n" + (result.itinerary || ""),
      ];
      const text = sections.join("\n\n");

      const now = Math.floor(Date.now() / 1000);
      return res.status(200).json({
        id: "chatcmpl_" + Math.random().toString(36).slice(2),
        object: "chat.completion",
        created: now,
        model,
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content: text },
          },
        ],
        usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null },
      });
    }
  } catch (err: any) {
    console.error("/v1/chat/completions error:", err?.message);
    return res.status(500).json({ error: { message: err?.message || "Internal error" } });
  }
});

// Mount the OpenAI-compatible base path without the /api prefix
app.use("/v1", openAIRouter);

// Add a root route for API information
app.get("/", (req, res) => {
  res.json({
    message: "AI Travel Agents API - Genkit Powered",
    version: "2.0.0",
    endpoints: {
      health: "/api/health",
      chat: "/api/chat (SSE streaming)",
      chatJson: "/api/v2/chat (JSON)",
      research: "/api/research (POST JSON)",
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
