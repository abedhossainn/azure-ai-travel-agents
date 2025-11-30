import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";

// Note: request-queue, usage, and ollama-model are local-only development files
// They are excluded from production builds via .gitignore

// TEMPORARY: Disable Ollama for Gemini performance testing
const FORCE_GEMINI = true;

/**
 * Exponential backoff retry for 429 errors (recommended by Google Cloud docs)
 * https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429
 */
async function retryWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const is429 = error?.message?.includes('429') || error?.message?.includes('Too Many Requests') || error?.message?.includes('Resource exhausted');
      
      if (!is429 || attempt === maxRetries) {
        throw error; // Not a rate limit error or out of retries
      }
      
      // Exponential backoff with jitter: delay = baseDelay * 2^attempt + random(0, 1000)
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
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
  model: googleAI.model((process.env.model || "gemini-2.0-flash-lite").replace(/^"|"$/g, ""), {
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
    model: process.env.model || "gemini-2.0-flash-lite",
    url: "https://generativelanguage.googleapis.com",
  };
}
