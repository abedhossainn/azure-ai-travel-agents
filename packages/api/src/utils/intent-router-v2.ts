import { ai } from "../genkit/ai.js";
import { masterAgent } from "../genkit/agents/sub-agents/master-agent.js";
import { formatFullResponse, formatLeanResponse } from "../genkit/agents/formatters/response-formatter.js";

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
 * Analyze user query to determine intent using LLM
 */
async function analyzeIntent(query: string): Promise<IntentAnalysis> {
  const prompt = `Analyze this travel query and classify the intent. Return ONLY valid JSON:
{
  "intent": "simple_question" | "research_only" | "recommendation" | "itinerary" | "full_planning",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Intent Types:
- simple_question: Single-category query (just flights, hotels, or activities)
- research_only: Wants multiple categories but no itinerary
- recommendation: Asking for destination suggestions
- itinerary: Wants day-by-day plan
- full_planning: Complete trip plan with everything

Query: ${query}`;

  try {
    const { text } = await ai.generate({ prompt });
    const parsed = JSON.parse(text?.trim() || "{}");
    return {
      intent: parsed.intent || "full_planning",
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning || "Default classification",
    };
  } catch {
    return {
      intent: "full_planning",
      confidence: 0.5,
      reasoning: "Fallback to full planning due to parse error",
    };
  }
}

/**
 * Extract travel context from query (origin, destination, dates, adults)
 */
async function extractContext(query: string) {
  const prompt = `Extract travel parameters from this query. Return ONLY valid JSON with NO markdown formatting:
{
  "origin": "IATA code or city name (e.g., 'JFK', 'New York', 'NYC')",
  "destination": "City or region name (e.g., 'London', 'Paris', 'Tokyo')",
  "startDate": "YYYY-MM-DD or null",
  "endDate": "YYYY-MM-DD or null",
  "month": "Full month name or null (e.g., 'April', 'December')",
  "year": 2025,
  "days": number or null,
  "adults": number (default 2)
}

IMPORTANT:
- Extract IATA codes like JFK, LAX, LHR as-is for origin
- Extract city names like London, Paris, Tokyo as-is for destination  
- If month name is mentioned (e.g., "April"), set month field to that name
- Default year is 2025 unless another year is mentioned

Query: "${query}"`;

  try {
    const { text } = await ai.generate({ prompt });
    // Remove markdown code blocks if present
    const cleaned = text?.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim() || "{}";
    const parsed = JSON.parse(cleaned);
    
      // Fallback: Use regex to extract common patterns if LLM fails
      if (!parsed.origin || !parsed.destination) {
        const originMatch = query.match(/\b([A-Z]{3})\b/); // IATA codes like JFK, LAX
        const toMatch = query.match(/\bto\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i); // "to London", "to New York"
        const fromMatch = query.match(/\bfrom\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i); // "from Paris"
      
        if (!parsed.origin && (originMatch || fromMatch)) {
          parsed.origin = originMatch?.[1] || fromMatch?.[1];
        }
        if (!parsed.destination && toMatch) {
          parsed.destination = toMatch[1];
        }
      }
    
    // If only month is provided, choose a deterministic date in that month (10th)
    if (!parsed.startDate && typeof parsed.month === "string" && parsed.month.trim()) {
      const monthName = parsed.month.trim().toLowerCase();
      const monthIndex = ["january","february","march","april","may","june","july","august","september","october","november","december"].indexOf(monthName);
      const now = new Date();
      const year = Number.isInteger(parsed.year) ? parsed.year : (monthIndex !== -1 && monthIndex < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear());
      if (monthIndex !== -1) {
        const m = String(monthIndex + 1).padStart(2, '0');
        parsed.startDate = `${year}-${m}-10`;
      }
    }
    
    // If startDate still missing, choose ~6 weeks from now
    if (!parsed.startDate) {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 42);
      parsed.startDate = d.toISOString().slice(0, 10);
    }
    
    // Compute endDate if missing
    if (!parsed.endDate && parsed.startDate) {
      const d = new Date(parsed.startDate + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + Math.max(1, parsed.days || 7));
      parsed.endDate = d.toISOString().slice(0, 10);
    }
    
    return {
      origin: parsed.origin || undefined,
      destination: parsed.destination || undefined,
      startDate: parsed.startDate || undefined,
      endDate: parsed.endDate || undefined,
      adults: Number.isInteger(parsed.adults) ? parsed.adults : 2,
    };
  } catch {
    // Fallback defaults
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 42);
    const startDate = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 7);
    const endDate = d.toISOString().slice(0, 10);
    
    return {
      origin: undefined,
      destination: undefined,
      startDate,
      endDate,
      adults: 2,
    };
  }
}

/**
 * Derive which categories to include based on query keywords
 */
function deriveIncludeFlags(query: string): { 
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
  const result = await masterAgent({
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
  
  const section = flags.includeFlights ? "flights" : flags.includeHotels ? "hotels" : "activities";
  const lean = formatLeanResponse(result, section as any);
  
  if (!lean || lean.trim().length < 10) return null;

  return lean;
}

/**
 * Main routing function - all queries go through master agent
 */
export async function routeQuery(query: string, days?: number): Promise<string> {
  // 1. Try lean response for simple queries
  const lean = await tryLeanResponse(query);
  if (lean) {
    return lean;
  }

  // 2. Analyze intent for full routing
  const analysis = await analyzeIntent(query);

  // 3. Extract context
  const context = await extractContext(query);

  // 4. Route to master agent with appropriate flags
  let result: any;

  switch (analysis.intent) {
    case "simple_question":
      const flags = deriveIncludeFlags(query);
      result = await masterAgent({
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
      break;

    case "research_only":
      result = await masterAgent({
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
      break;

    case "recommendation":
      result = await masterAgent({
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
      break;

    case "itinerary":
      result = await masterAgent({
        query,
        needsFlights: false,
        needsHotels: false,
        needsActivities: true,
        needsItinerary: true,
        needsInsights: false,
        needsCost: false,
        needsRecommendations: false,
        ...context,
      });
      break;

    case "full_planning":
    default:
      result = await masterAgent({
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
      break;
  }

  return formatFullResponse(result);
}
