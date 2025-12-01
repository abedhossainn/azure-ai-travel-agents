import dotenv from "dotenv";
import path from "node:path";
const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

import cors from "cors";
import express from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { initRedis, getCacheStats, clearCachePattern } from "./utils/cache.js";
import { getAiProvider } from "./genkit/ai.js";
import { routeQuery } from "./utils/intent-router-v2.js";
import { injectClientRateLimiter } from "./utils/request-rate-limiter.js";

// Register all Genkit flows for telemetry and dev UI traces
import "./genkit/register-flows.js";

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

// Health check endpoint
apiRouter.get("/health", async (req, res) => {
  const googleKey =
    process.env.GOOGLE_CSE_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const googleCx =
    process.env.GOOGLE_CSE_CX ||
    process.env.GOOGLE_CUSTOM_SEARCH_CX ||
    process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
  const live = Boolean(googleKey && googleCx);
  const cacheStats = await getCacheStats();
  const aiProvider = getAiProvider();
  
  res.status(200).json({ 
    status: "OK", 
    webSearch: { live, keyConfigured: Boolean(googleKey), cxConfigured: Boolean(googleCx) },
    cache: cacheStats,
    aiProvider
  });
});

// MCP tools endpoint disabled (simplified mode)
apiRouter.get("/tools", async (req, res) => {
  res.status(200).json({ tools: [], message: "Tools endpoint disabled in simplified mode" });
});

// Rate limiter injection script endpoint (for client-side use)
apiRouter.get("/rate-limiter.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.send(injectClientRateLimiter());
});

// Chat endpoint with Server-Sent Events (SSE) for streaming responses
// SIMPLIFIED VERSION - No MCP tools, just basic LLM chat
// @ts-ignore - Ignoring TypeScript errors for Express route handlers
apiRouter.post("/chat", async (req, res) => {
  if (!req.body) {
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
    // Use intent-based routing with master agent
    async function* generateEvents() {
      try {
        // Run the routed workflow (lean or full based on intent)
        const days = extractDays(message);
        const currency = (req.body?.currency || req.query?.currency || '').toString().trim() || undefined;
        const locale = (req.headers['accept-language'] as string | undefined)?.split(',')[0]?.trim();
        const originPref = (req.body?.origin || req.query?.origin || '').toString().trim() || undefined;
        const result = await routeQuery(message, days, { currency, locale, origin: originPref });
        
        // result is now a formatted markdown string
        const content = result;

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
              agent: "TravelMasterAgent",
              ...tokenPayload,
            },
          };
        }

        // Final message
        yield {
          eventName: "agent_complete",
          data: {
            agent: "TravelMasterAgent",
            content,
          },
        };
      } catch (error: any) {
        let errMsg = error?.message || "Unknown error occurred";
        yield {
          eventName: "agent_complete",
          data: {
            agent: "TravelMasterAgent",
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
          }
          this.push(null); // Close the stream
        } catch (error: any) {
          // Streaming error - client may have disconnected
        }
      },
    });

    await pipeline(readableStream, res);
  } catch (error) {
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
// Uses master agent routing for orchestrated workflow
// @ts-ignore - Ignoring TypeScript errors for Express route handlers
apiRouter.post("/v2/chat", async (req, res) => {
  if (!req.body || !req.body.message) {
    return res.status(400).json({ error: "Message is required" });
  }
  try {
    const days = extractDays(req.body.message);
    const currency = (req.body?.currency || req.query?.currency || '').toString().trim() || undefined;
    const locale = (req.headers['accept-language'] as string | undefined)?.split(',')[0]?.trim();
    const originPref = (req.body?.origin || req.query?.origin || '').toString().trim() || undefined;
    const result = await routeQuery(req.body.message, days, { currency, locale, origin: originPref });
    return res.status(200).json({ 
      agent: "TravelMasterAgent", 
      content: result
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Research endpoint: returns structured research JSON via master agent
// @ts-ignore - Ignoring TypeScript errors for Express route handlers
apiRouter.post("/research", async (req, res) => {
  const message = req.body?.message || req.body?.query || req.query?.q;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "message is required" });
  }
  try {
    // Route through master agent with research-only intent
    const result = await routeQuery(message);
    return res.status(200).json({ content: result });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Cache stats endpoint (admin/debug)
// @ts-ignore - Ignoring TypeScript errors for Express route handlers
apiRouter.get("/cache/stats", async (req, res) => {
  try {
    const stats = await getCacheStats();
    return res.status(200).json(stats);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
});

// Clear cache endpoint (admin/debug)
// @ts-ignore - Ignoring TypeScript errors for Express route handlers
apiRouter.delete("/cache/clear", async (req, res) => {
  try {
    const pattern = req.query.pattern || "amadeus:*";
    const cleared = await clearCachePattern(pattern as string);
    return res.status(200).json({ cleared, pattern });
  } catch (err: any) {
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
        const startTime = Date.now();
        // Use routeQuery which properly handles intent analysis and formatting
        const currency = (req.body?.currency || req.query?.currency || '').toString().trim() || undefined;
        const locale = (req.headers['accept-language'] as string | undefined)?.split(',')[0]?.trim();
        const originPref = (req.body?.origin || req.query?.origin || '').toString().trim() || undefined;
        const formatted = await routeQuery(content, days, { currency, locale, origin: originPref });
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
        for (let i = 0; i < formatted.length; i += chunkSize) {
          writeChunk(formatted.slice(i, i + chunkSize));
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        writeChunk(`\n\n---\n\n*Response time: ${processingTime}s*\n`);
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
      // Non-streaming response
      const currency = (req.body?.currency || req.query?.currency || '').toString().trim() || undefined;
      const locale = (req.headers['accept-language'] as string | undefined)?.split(',')[0]?.trim();
      const originPref = (req.body?.origin || req.query?.origin || '').toString().trim() || undefined;
      const formatted = await routeQuery(content, days, { currency, locale, origin: originPref });
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
            message: { role: "assistant", content: formatted },
          },
        ],
        usage: { prompt_tokens: null, completion_tokens: null, total_tokens: null },
      });
    }
  } catch (err: any) {
    return res.status(500).json({ error: { message: err?.message || "Internal error" } });
  }
});

// Mount the OpenAI-compatible base path without the /api prefix
app.use("/v1", openAIRouter);

// Add a root route for API information
app.get("/", (req, res) => {
  res.json({
    name: "AI Travel Agents API",
    description: "Genkit + Ollama/Gemini powered travel planning",
    version: "2.0.0",
    endpoints: {
      health: "GET /api/health",
      chat_streaming: "POST /api/chat (SSE)",
      chat_json: "POST /api/v2/chat (JSON)",
      research: "POST /api/research",
      openai_compatible: "POST /v1/chat/completions",
    },
    docs: "https://github.com/abedhossainn/azure-ai-travel-agents",
  });
});

// Start the server
app.listen(PORT, async () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  - Health check: http://localhost:${PORT}/api/health (GET)`);
  console.log(`  - MCP Tools: http://localhost:${PORT}/api/tools (GET)`);
  console.log(`  - Chat: http://localhost:${PORT}/api/chat (POST)`);
  console.log(`  - Cache stats: http://localhost:${PORT}/api/cache/stats (GET)`);
  console.log(`  - Clear cache: http://localhost:${PORT}/api/cache/clear (DELETE)`);
  
  // Initialize Redis connection
  await initRedis();
});
