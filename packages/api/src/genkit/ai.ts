import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";
import { requestQueue } from "../utils/request-queue.js";
import { incrementAiUsage, getAiUsage } from "../utils/usage.js";
import { getOllamaConfig, callOllamaModel } from "../utils/ollama-model.js";

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
(ai as any).generate = async function (...args: any[]) {
  (ai as any).__metrics.generateCalls += 1;
  const callNum = (ai as any).__metrics.generateCalls;
  
  // Check if Ollama is configured
  const ollamaConfig = getOllamaConfig();
  // Temporarily disable Ollama to use Gemini for performance testing
  if (ollamaConfig.enabled && !FORCE_GEMINI) {
    console.log(`[OLLAMA] Intercepting ai.generate() call ${callNum} - routing to Ollama`);
    
    // Extract prompt/messages from Genkit args
    const [options] = args;
    let messages: Array<{ role: string; content: string }> = [];
    
    // Genkit can accept prompt (string) or messages (array)
    if (options.prompt) {
      messages = [{ role: "user", content: options.prompt }];
    } else if (options.messages) {
      messages = options.messages.map((m: any) => ({
        role: m.role || "user",
        content: m.content || m.text || String(m)
      }));
    } else if (typeof options === 'string') {
      messages = [{ role: "user", content: options }];
    }
    
    try {
      const response = await callOllamaModel(
        messages,
        ollamaConfig.model,
        ollamaConfig.url,
        options.config?.temperature || 0.7
      );
      
      // Return in Genkit-compatible format
      return {
        text: response,
        output: response,
        finishReason: "stop",
        usage: {
          // Estimate tokens (Ollama doesn't return token counts)
          inputTokens: Math.round(JSON.stringify(messages).length / 4),
          outputTokens: Math.round(response.length / 4),
          totalTokens: Math.round((JSON.stringify(messages).length + response.length) / 4),
        }
      };
    } catch (error) {
      console.error(`[OLLAMA] Error in ai.generate():`, error);
      throw error;
    }
  }
  
  // Otherwise use the original Genkit/Gemini flow
  // Optional: check local daily/monthly guard (opt-in) before making the request
  try {
    const limitsDaily = Number(process.env.AI_DAILY_LIMIT || 0) || 0;
    const limitsMonthly = Number(process.env.AI_MONTHLY_LIMIT || 0) || 0;
    if (limitsDaily > 0 || limitsMonthly > 0) {
      const { daily = 0, monthly = 0 } = (await getAiUsage()) || {};
      if (limitsDaily > 0 && daily >= limitsDaily) {
        throw new Error(`AI_USAGE_LIMIT_REACHED: daily ${daily} >= limit ${limitsDaily}`);
      }
      if (limitsMonthly > 0 && monthly >= limitsMonthly) {
        throw new Error(`AI_USAGE_LIMIT_REACHED: monthly ${monthly} >= limit ${limitsMonthly}`);
      }
    }
  } catch (e) {
    // If Redis is unavailable, just continue (best-effort guard)
  }

  // Enqueue the request to respect rate limits
  return requestQueue.enqueue(async () => {
    console.log(`METRIC: AI_CALL total=${callNum} queue=${requestQueue.getStats().queueLength}`);
    
    // Apply exponential backoff retry for rate limit errors
    const out = await retryWithExponentialBackoff(() => _origGenerate.apply(this, args));
    // Best-effort: increment usage counters in Redis for daily/monthly tracking
    try { await incrementAiUsage(); } catch (e) { /* ignore */ }
    return out;
  });
};

// Also try to capture token usage when available from the provider
// We add an additional log line when the response includes token usage or when
// we can estimate tokens from the returned text. This is meant for local
// benchmarking; do not export these logs to production telemetry.
const _origGenerateWithTokens = (ai as any).generate;
(ai as any).generate = async function (...args: any[]) {
  const resp = await _origGenerateWithTokens.apply(this, args);
  try {
    // Best-effort: common providers include `usage` or `tokens` metadata
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    let totalTokens: number | null = null;
    // Some providers return an object with usage.total_tokens
    // Try common fields across providers: usage, raw.usage, meta.usage, choices[0].usage
    const maybeUsage = (resp as any)?.usage || (resp as any)?.raw?.usage || (resp as any)?.meta?.usage || (resp as any)?.result?.usage || (resp as any)?.choices?.[0]?.usage;
    if (maybeUsage) {
  promptTokens = maybeUsage.prompt_tokens ?? (maybeUsage.prompt ?? null);
  completionTokens = maybeUsage.completion_tokens ?? (maybeUsage.completion ?? null);
  totalTokens = maybeUsage.total_tokens ?? (maybeUsage.total ?? null);
    }

    // Some providers embed token usage deeper or with different names (providers vary)
    // Look for other likely properties using a shallow search
    if (!totalTokens) {
      const maybe = (resp as any)?.tokens || (resp as any)?.usage_tokens || (resp as any)?.tokenUsage || (resp as any)?.token_usage || (resp as any)?.total_tokens || (resp as any)?.totalTokens;
      if (maybe && typeof maybe === 'number') {
        totalTokens = maybe;
      } else if (maybe && typeof maybe === 'object') {
        totalTokens = (maybe.total_tokens || maybe.totalTokens || maybe.total) ?? null;
        promptTokens = promptTokens ?? (maybe.prompt_tokens || maybe.prompt || null);
        completionTokens = completionTokens ?? (maybe.completion_tokens || maybe.completion || maybe.completionTokens || null);
      }
    }
    
    // Fallback: shallow scan for keys that contain 'token' in their name
    function shallowFindTokens(o: any, depth = 0): { prompt?: number; completion?: number; total?: number } {
      if (!o || typeof o !== 'object' || depth > 2) return {};
      let out: any = {};
      for (const k of Object.keys(o)) {
        const v = o[k];
        const name = k.toLowerCase();
        if (name.includes('token') && (typeof v === 'number' || typeof v === 'string')) {
          const num = Number(v) || 0;
          if (name.includes('prompt')) out.prompt = out.prompt || num;
          else if (name.includes('completion') || name.includes('comp')) out.completion = out.completion || num;
          else if (name.includes('total')) out.total = out.total || num;
          else out.total = out.total || num;
        } else if (typeof v === 'object') {
          const sub = shallowFindTokens(v, depth + 1);
          out = { ...sub, ...out } as any;
        }
      }
      return out;
    }
    if (!totalTokens) {
      const scan = shallowFindTokens(resp);
      if (scan.total && !totalTokens) totalTokens = scan.total;
      if (scan.prompt && !promptTokens) promptTokens = scan.prompt;
      if (scan.completion && !completionTokens) completionTokens = scan.completion;
    }

    // If tokens are not provided, try estimating from returned text length
  const text = (resp as any)?.text ?? (Array.isArray((resp as any)?.choices) && (resp as any).choices[0]?.message?.content) ?? (resp as any)?.output ?? '';
    if (!totalTokens && typeof text === 'string' && text.length > 0) {
      // Heuristic: 1 token ≈ 4 characters (English). Round up.
      totalTokens = Math.max(1, Math.round(text.length / 4));
      // Use approximate split for prompt/completion
      completionTokens = totalTokens;
    }

    if (totalTokens) {
      const model = process.env.model || ((ai as any).model && (ai as any).model.id) || 'unknown';
      console.log(`METRIC: AI_TOKENS model=${model} prompt=${promptTokens ?? 0} completion=${completionTokens ?? totalTokens} total=${totalTokens}`);
    }
  } catch (e) {
    // Best-effort only — ignore errors
  }
  return resp;
};

export function getAiMetrics() {
  return (ai as any).__metrics || { generateCalls: 0 };
}

/**
 * Get current AI provider info (for health endpoint and debugging)
 */
export function getAiProvider() {
  const ollamaConfig = getOllamaConfig();
  if (ollamaConfig.enabled && !FORCE_GEMINI) {
    return {
      provider: "ollama",
      model: ollamaConfig.model,
      url: ollamaConfig.url,
      local: true,
    };
  }
  return {
    provider: "google-genai",
    model: process.env.model || "gemini-2.0-flash-lite",
    url: "https://generativelanguage.googleapis.com",
    local: false,
  };
}
