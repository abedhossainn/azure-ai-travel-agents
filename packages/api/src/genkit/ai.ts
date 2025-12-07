import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";

// Note: request-queue, usage, and ollama-model are local-only development files
// They are excluded from production builds via .gitignore

// TEMPORARY: Disable Ollama for Gemini performance testing
const FORCE_GEMINI = true;

/**
 * Exponential backoff retry for 429 errors (recommended by Google Cloud docs)
 * Throws descriptive error after max retries so we can handle gracefully on client
 * https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429
 */
async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelay: number = 800
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const is429 = error?.message?.includes('429') || error?.message?.includes('Too Many Requests') || error?.message?.includes('Resource exhausted');
      
      if (!is429) {
        throw error; // Not a rate limit error, throw immediately
      }
      
      if (attempt === maxRetries) {
        // Out of retries, create descriptive rate limit error
        console.error(`[RATE_LIMIT] Max retries exceeded for 429 error. User should wait before retrying.`);
        const rateLimitError = new Error(
          'API QUOTA LIMIT REACHED\n\n' +
          'Your request exceeded the Google Gemini API rate limit (30 requests per minute).\n\n' +
          'WHAT TO DO:\n' +
          '- Wait 30-60 seconds before submitting another query\n' +
          '- The quota resets at midnight Pacific time (UTC-8)\n' +
          '- For faster testing, upgrade your Google Cloud API to paid tier\n\n' +
          'RATE LIMIT INFO:\n' +
          '- Free tier: 30 requests per minute\n' +
          '- Per query: approximately 8-10 LLM calls (parallel sub-agents)\n' +
          '- Safe spacing: 3-5 seconds between queries recommended\n\n' +
          'Learn more: https://ai.google.dev/gemini-api/docs/rate-limits'
        );
        (rateLimitError as any).code = 429;
        (rateLimitError as any).isRateLimit = true;
        throw rateLimitError;
      }
      
      // Exponential backoff with jitter: delay = baseDelay * 2^attempt + random(0, 500)
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      console.log(`[RETRY] 429 error, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

// Initialize Genkit with Google Gemini provider (fallback when Ollama is not configured)
// Ollama interception happens below in the generate() wrapper
export const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model((process.env.MODEL || "gemini-2.5-flash-lite").replace(/^"|"$/g, ""), {
    temperature: 0.7,
  }),
});

// Lightweight instrumentation for local benchmarking and cost proxies
// Do not ship metrics across production environments; this is meant for
// developer-local measurements only.
;(ai as any).__metrics = { generateCalls: 0 };
const _origGenerate = (ai as any).generate;

// Wrap generate with queue + retry logic for 429 errors
// Also intercept and route to Ollama when configured
// Metrics for tracking AI calls (local development only)
(ai as any).__metrics = {
  generateCalls: 0
};

// Note: Ollama interception is disabled (FORCE_GEMINI = true)
// This means all requests go directly to Gemini (googleAI)
// Development utilities like request-queue, usage tracking, and ollama-model are excluded from production builds

// Wrap generate with retry logic for rate limit errors
const _origGenerateWithRetry = (ai as any).generate;
(ai as any).generate = async function (...args: any[]) {
  (ai as any).__metrics.generateCalls += 1;
  const callNum = (ai as any).__metrics.generateCalls;
  
  console.log(`METRIC: AI_CALL total=${callNum}`);
  
  // Apply exponential backoff retry for rate limit errors
  return retryWithExponentialBackoff(() => _origGenerateWithRetry.apply(this, args));
};

export function getAiMetrics() {
  return (ai as any).__metrics || { generateCalls: 0 };
}

/**
 * Get current AI provider info (for health endpoint and debugging)
 */
export function getAiProvider() {
  // Using Gemini exclusively (Ollama disabled via FORCE_GEMINI)
  return {
    provider: "google-genai",
    model: process.env.MODEL || "gemini-2.5-flash-lite",
    url: "https://generativelanguage.googleapis.com",
  };
}
