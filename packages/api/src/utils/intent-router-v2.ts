import { ai } from "../genkit/ai.js";
import { masterAgent } from "../genkit/agents/sub-agents/master-agent.js";
import { formatFullResponse, formatLeanResponse } from "../genkit/agents/formatters/response-formatter.js";
import { getCacheKey, getCached, setCached, withCache, CACHE_TTL } from "./cache.js";

/**
 * Format rate limit error response
 */
function formatRateLimitResponse(): string {
  const msg = "API QUOTA LIMIT REACHED\n\n" +
    "Your request exceeded the Google Gemini API rate limit (30 requests per minute).\n\n" +
    "WHAT TO DO:\n" +
    "- Wait 30-60 seconds before submitting another query\n" +
    "- The quota resets at midnight Pacific time (UTC-8)\n" +
    "- For faster testing, upgrade your Google Cloud API to paid tier\n\n" +
    "RATE LIMIT INFO:\n" +
    "- Free tier: 30 requests per minute\n" +
    "- Per query: approximately 8-10 LLM calls (parallel sub-agents)\n" +
    "- Safe spacing: 3-5 seconds between queries recommended\n\n" +
    "Learn more: https://ai.google.dev/gemini-api/docs/rate-limits";
  return msg;
}

/**
 * Simplified Intent Router for Master Agent Architecture
 * 
 * All workflows go through the master agent with appropriate flags.
 * No legacy flows, no complex conditionals - just clean routing.
 */

type IntentType = "simple_question" | "research_only" | "recommendation" | "itinerary" | "full_planning";

interface IntentAnalysis {
  intent: IntentType;
  confidence: number;
  reasoning: string;
}

/**
 * Analyze user query to determine intent using KEYWORDS FIRST (minimal AI calls)
 */
export function analyzeIntent(query: string): IntentAnalysis {
  const lower = query.toLowerCase();
  
  // Check for recommendation queries (most specific - check first)
  if (/(recommend|suggest|where should|best destination|top destination|which place|which city).*(go|visit|travel)/i.test(lower)) {
    return { intent: "recommendation", confidence: 0.9, reasoning: "Keyword match: recommendation" };
  }
  
  // Check for full planning queries (trip/plan/itinerary)
  if (/(plan.*trip|create.*itinerary|organize.*trip|book.*trip|schedule.*trip|full.*plan|complete.*plan)/i.test(lower)) {
    return { intent: "full_planning", confidence: 0.9, reasoning: "Keyword match: full planning" };
  }
  
  // Check for itinerary-only queries (no flights/hotels mentioned)
  if (/(itinerary|schedule|day by day)(?!.*flight|.*hotel)/i.test(lower)) {
    return { intent: "itinerary", confidence: 0.8, reasoning: "Keyword match: itinerary" };
  }
  
  // Check for research queries (multiple categories, no planning words)
  const hasMultiple = [
    /(flight|fly)/i.test(lower),
    /(hotel|accommodation)/i.test(lower),
    /(activity|attraction|things to do)/i.test(lower)
  ].filter(Boolean).length >= 2;
  
  if (hasMultiple && !/(plan|itinerary|schedule)/i.test(lower)) {
    return { intent: "research_only", confidence: 0.8, reasoning: "Keyword match: research" };
  }
  
  // Check for single-category queries
  const categories = {
    flight: /(flight|flights|airfare)/i.test(lower),
    hotel: /(hotel|hotels|accommodation)/i.test(lower),
    activity: /(activity|activities|attraction|things to do)/i.test(lower)
  };
  
  const singleCategory = Object.values(categories).filter(Boolean).length === 1;
  if (singleCategory) {
    return { intent: "simple_question", confidence: 0.8, reasoning: "Keyword match: single category" };
  }
  
  // Default: full planning (when in doubt, provide everything)
  return {
    intent: "full_planning",
    confidence: 0.7,
    reasoning: "Default to full planning",
  };
}

/**
 * Extract travel context from query using LLM (now that we have Ollama with no quota limits)
 * This provides much better accuracy than regex patterns
 */
export async function extractContext(query: string) {
  // Cache only the raw LLM extraction; compute date defaults after retrieval
  const extractKey = getCacheKey("extract", { q: query.trim().toLowerCase() });
  const prompt = `Extract travel planning information from this query. Return ONLY a JSON object, no other text.

Query: "${query}"

Extract these fields:
- origin: departure city (e.g., "New York", "London", "Tokyo") or null if not mentioned
- destination: destination city (e.g., "Paris", "Rome", "Bangkok") or null if not mentioned  
- startDate: travel start date in YYYY-MM-DD format, or null if not mentioned
- endDate: travel end date in YYYY-MM-DD format, or null if not mentioned
- adults: number of travelers (default: 2 if not mentioned)
- days: trip duration in days (default: 7 if not mentioned)

Important:
- If a month is mentioned without a day, use the 10th of that month
- If a year is not mentioned, use ${new Date().getFullYear()} or ${new Date().getFullYear() + 1} for months that have passed
- Calculate endDate from startDate + days if only duration is given
- Return valid JSON only, no markdown, no explanations

Example output:
{"origin":"New York","destination":"Paris","startDate":"2026-03-10","endDate":"2026-03-13","adults":2,"days":3}`;

  try {
    const extracted = await withCache(extractKey, CACHE_TTL.EXTRACTS, async () => {
      const response = await ai.generate({
        prompt,
        config: { temperature: 0.1 },
      });
      const text = response.text || response.output || '';
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (!jsonMatch) return null;
      return JSON.parse(jsonMatch[0]);
    });
    if (!extracted) {
      console.warn('[EXTRACT] No JSON found in LLM response, using defaults');
      return {
        origin: undefined,
        destination: undefined,
        startDate: getDefaultStartDate(),
        endDate: getDefaultEndDate(7),
        adults: 2,
      };
    }
    
    // Post-process: calculate dates if needed
    if (!extracted.startDate && extracted.days) {
      extracted.startDate = getDefaultStartDate();
    }
    if (extracted.startDate && extracted.days && !extracted.endDate) {
      const start = new Date(extracted.startDate + "T00:00:00Z");
      start.setUTCDate(start.getUTCDate() + (extracted.days || 7));
      extracted.endDate = start.toISOString().slice(0, 10);
    }
    
    console.log('[EXTRACT] LLM extracted:', JSON.stringify(extracted));
    
    return {
      origin: extracted.origin || undefined,
      destination: extracted.destination || undefined,
      startDate: extracted.startDate || getDefaultStartDate(),
      endDate: extracted.endDate || getDefaultEndDate(extracted.days || 7),
      adults: extracted.adults || 2,
    };
  } catch (error) {
    console.error('[EXTRACT] Error using LLM for extraction:', error);
    // Fallback to defaults
    return {
      origin: undefined,
      destination: undefined,
      startDate: getDefaultStartDate(),
      endDate: getDefaultEndDate(7),
      adults: 2,
    };
  }
}

// Helper functions for default dates
function getDefaultStartDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 42); // 6 weeks from now
  return d.toISOString().slice(0, 10);
}

function getDefaultEndDate(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 42 + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Derive which categories to include based on query keywords
 */
export function deriveIncludeFlags(query: string): { 
  includeFlights: boolean; 
  includeHotels: boolean; 
  includeActivities: boolean;
} {
  const lower = query.toLowerCase();
  const wantsFlight = /(flight|flights|airfare|fare|round[- ]?trip|ticket|fly|flying)/i.test(lower);
  const wantsHotel = /(hotel|hotels|stay|accommodation|lodging|resort|hostel|airbnb|where to stay)/i.test(lower);
  const wantsActivities = /(activity|activities|attraction|things to do|tour|museum|excursion|what to do|see|visit)/i.test(lower);

  return {
    includeFlights: wantsFlight,
    includeHotels: wantsHotel,
    includeActivities: wantsActivities,
  };
}

/**
 * Try to answer simple, single-category queries directly (lean response)
 */
async function tryLeanResponse(query: string): Promise<string | null> {
  const lower = query.toLowerCase();
  
  // Check for single-category intent
  const wantsFlight = /(flight|flights|airfare|fare|round[- ]?trip|ticket|fly|flying)/i.test(lower);
  const wantsHotel = /(hotel|hotels|stay|accommodation|lodging|resort|hostel|airbnb|where to stay)/i.test(lower);
  const wantsActivities = /(activity|activities|attraction|things to do|tour|museum|excursion|what to do|see|visit)/i.test(lower);
  
  // Check for planning keywords that indicate user wants full plan
  const planningWords = /(itinerary|plan|schedule|day by day|recommend destination|suggest destination|full trip|complete plan)/i.test(lower);

  // If user wants planning/itinerary, don't do lean response
  if (planningWords) return null;

  const flags = {
    includeFlights: wantsFlight,
    includeHotels: wantsHotel,
    includeActivities: wantsActivities,
  };
  
  // Only proceed if exactly ONE category is requested
  const categoryCount = [flags.includeFlights, flags.includeHotels, flags.includeActivities].filter(Boolean).length;
  if (categoryCount !== 1) return null;

  // Extract context
  const context = await extractContext(query);
  
    // Validate we have minimum required data for flights
    if (flags.includeFlights && (!context.origin || !context.destination)) {
      return null;
    }
  
  // Invoke master agent with single section
  const flowResult = await masterAgent.run({
    query,
    needsFlights: flags.includeFlights,
    needsHotels: flags.includeHotels,
    needsActivities: flags.includeActivities,
    needsItinerary: false,
    needsInsights: false,
    needsCost: false,
    needsRecommendations: false,
    ...context,
  });
  // Unwrap Genkit flow result ({ result, telemetry })
  const result = (flowResult as any)?.result ?? flowResult;

  const section = flags.includeFlights ? "flights" : flags.includeHotels ? "hotels" : "activities";
  const lean = formatLeanResponse(result as any, section as any);
  
  // Debug: log what we got
  console.log(`[LEAN] section=${section}, hasData=${Boolean((result as any)[section])}, leanLength=${lean?.length || 0}`);
  
  if (!lean || lean.trim().length < 10) {
    console.log(`[LEAN] Fallback to full response - lean too short or empty`);
    return null;
  }

  return lean;
}

/**
 * Main routing function - all queries go through master agent
 * Catches 429 rate limit errors and returns user-friendly response
 */
export async function routeQuery(query: string, days?: number, opts?: { currency?: string; locale?: string; origin?: string; }): Promise<string> {
  try {
    return await _routeQueryInternal(query, days, opts);
  } catch (error: any) {
    // Check if this is a rate limit error
    if (error?.code === 429 || error?.isRateLimit === true) {
      console.error(`[RATE_LIMIT] Returning user-friendly rate limit message`);
      return formatRateLimitResponse();
    }
    // For other errors, re-throw
    throw error;
  }
}

/**
 * Internal routing logic - all queries go through master agent
 */
async function _routeQueryInternal(query: string, days?: number, opts?: { currency?: string; locale?: string; origin?: string; }): Promise<string> {
  console.log(`[ROUTE] Query: "${query}"`);
  // Response-level cache: serve pre-formatted content for repeated queries
  // Build base key and enrich after context extraction
  const baseParams: Record<string, any> = { q: query.trim() };
  if (typeof days === 'number') baseParams.days = days;
  if (opts?.currency) baseParams.currency = opts.currency;
  if (opts?.locale) baseParams.locale = opts.locale;
  if (opts?.origin) baseParams.originPref = opts.origin;
  const responseKey = getCacheKey("response", baseParams);
  const cachedResponse = await getCached<string>(responseKey);
  if (cachedResponse) {
    console.log(`[ROUTE] Returning cached response`);
    return cachedResponse;
  }
  
  // 1. Try lean response for simple queries
  const lean = await tryLeanResponse(query);
  if (lean) {
    console.log(`[ROUTE] Returning lean response`);
    await setCached(responseKey, lean, CACHE_TTL.RESPONSES);
    return lean;
  }

  // 2. Analyze intent for full routing (synchronous keyword-based)
  const analysis = analyzeIntent(query);
  console.log(`[ROUTE] Intent: ${analysis.intent} (${analysis.confidence})`);

  // 3. Extract context using LLM (async now)
  const context = await extractContext(query);
  console.log(`[ROUTE] Context:`, JSON.stringify(context));
  const enrichedParams: Record<string, any> = { ...baseParams };
  if (context?.origin) enrichedParams.origin = (context.origin as string).trim();
  if (context?.destination) enrichedParams.destination = (context.destination as string).trim();
  if (context?.adults) enrichedParams.adults = context.adults;
  if (context?.startDate) enrichedParams.startDate = context.startDate;
  if (context?.endDate) enrichedParams.endDate = context.endDate;
  // Carry through optional currency/locale if provided
  if (opts?.currency) enrichedParams.currency = opts.currency;
  if (opts?.locale) enrichedParams.locale = opts.locale;
  const enrichedResponseKey = getCacheKey("response", enrichedParams);

  // 4. Route to master agent with appropriate flags
  let result: any;

  switch (analysis.intent) {
    case "simple_question":
      const flags = deriveIncludeFlags(query);
      {
        // Execute flow and unwrap Genkit result
      }
      const r0 = await masterAgent.run({
        query,
        needsFlights: flags.includeFlights,
        needsHotels: flags.includeHotels,
        needsActivities: flags.includeActivities,
        needsItinerary: false,
        needsInsights: false,
        needsCost: false,
        needsRecommendations: false,
        ...context,
      });
      result = (r0 as any)?.result ?? r0;
      break;

    case "research_only":
      {
        // Execute flow and unwrap Genkit result
      }
      const r1 = await masterAgent.run({
        query,
        needsFlights: true,
        needsHotels: true,
        needsActivities: true,
        needsItinerary: false,
        needsInsights: false,
        needsCost: false,
        needsRecommendations: false,
        ...context,
      });
      result = (r1 as any)?.result ?? r1;
      break;

    case "recommendation":
      {
        // Execute flow and unwrap Genkit result
      }
      const r2 = await masterAgent.run({
        query,
        needsFlights: false,
        needsHotels: false,
        needsActivities: false,
        needsItinerary: false,
        needsInsights: false,
        needsCost: false,
        needsRecommendations: true,
        ...context,
      });
      result = (r2 as any)?.result ?? r2;
      break;

    case "itinerary":
      // User wants day-by-day plan, but should also include hotels and insights
      {
        // Execute flow and unwrap Genkit result
      }
      const r3 = await masterAgent.run({
        query,
        needsFlights: false,
        needsHotels: true,
        needsActivities: true,
        needsItinerary: true,
        needsInsights: true,
        needsCost: false,
        needsRecommendations: false,
        ...context,
      });
      result = (r3 as any)?.result ?? r3;
      break;

    case "full_planning":
    default:
      console.log(`[ROUTE] Full planning mode - enabling all agents`);
      const r4 = await masterAgent.run({
        query,
        needsFlights: true,
        needsHotels: true,
        needsActivities: true,
        needsItinerary: true,
        needsInsights: true,
        needsCost: true,
        needsRecommendations: false,
        ...context,
      });
      result = (r4 as any)?.result ?? r4;
      console.log(`[ROUTE] Master agent result keys:`, Object.keys(result || {}));
      break;
  }

  console.log(`[ROUTE] Formatting response with data:`, JSON.stringify(result).substring(0, 200));
  const formatted = formatFullResponse(result as any);
  await setCached(enrichedResponseKey, formatted, CACHE_TTL.RESPONSES);
  return formatted;
}
