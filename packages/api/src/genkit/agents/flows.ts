import { z } from "genkit";
import { ai } from "../ai.js";

// Customer Query Flow - extracts preferences in natural language (LLM only)
export const CustomerQueryInputSchema = z.object({ query: z.string().min(1) });
export const CustomerQueryOutputSchema = z.object({ content: z.string() });
export const customerQueryFlow = ai.defineFlow(
  {
    name: "customerQueryFlow",
    inputSchema: CustomerQueryInputSchema,
    outputSchema: CustomerQueryOutputSchema,
  },
  async (input: z.infer<typeof CustomerQueryInputSchema>) => {
    const prompt = `Extract travel preferences from the following customer inquiry. Return concise bullet points.
Inquiry: ${input.query}`;
    const { text } = await ai.generate({ prompt });
    return { content: text ?? "" };
  }
);

// Destination Recommendation Flow - suggests destinations (LLM only)
export const DestinationRecInputSchema = z.object({
  prompt: z.string().min(1),
});
export const DestinationRecOutputSchema = z.object({ content: z.string() });
export const destinationRecommendationFlow = ai.defineFlow(
  {
    name: "destinationRecommendationFlow",
    inputSchema: DestinationRecInputSchema,
    outputSchema: DestinationRecOutputSchema,
  },
  async (input: z.infer<typeof DestinationRecInputSchema>) => {
    const prompt = `Recommend 3 travel destinations based on the following constraints. For each, include 2 pros and 1 con.
Constraints: ${input.prompt}`;
    const { text } = await ai.generate({ prompt });
    return { content: text ?? "" };
  }
);

// Itinerary Planning Flow - creates a simple day-by-day plan (LLM only)
export const ItineraryInputSchema = z.object({
  destination: z.string().min(1),
  days: z.number().int().min(1).max(14).default(3),
});
export const ItineraryOutputSchema = z.object({ content: z.string() });
export const itineraryPlanningFlow = ai.defineFlow(
  {
    name: "itineraryPlanningFlow",
    inputSchema: ItineraryInputSchema,
    outputSchema: ItineraryOutputSchema,
  },
  async (input: z.infer<typeof ItineraryInputSchema>) => {
    const prompt = `Create a ${input.days}-day itinerary for ${input.destination}. For each day, list morning, afternoon, and evening activities and a short transit tip.`;
    const { text } = await ai.generate({ prompt });
    return { content: text ?? "" };
  }
);

// Web Search Flow (live search via Google CSE; falls back to LLM-only)
export const WebSearchInputSchema = z.object({
  query: z.string().min(1),
});
export const WebSearchOutputSchema = z.object({ content: z.string() });
export const webSearchFlow = ai.defineFlow(
  {
    name: "webSearchFlow",
    inputSchema: WebSearchInputSchema,
    outputSchema: WebSearchOutputSchema,
  },
  async (input: z.infer<typeof WebSearchInputSchema>) => {
    const key =
      process.env.GOOGLE_CSE_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
    const cx =
      process.env.GOOGLE_CSE_CX ||
      process.env.GOOGLE_CUSTOM_SEARCH_CX ||
      process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
    if (!key || !cx) {
      // Fallback: no live browse, just an LLM answer with disclaimer
      const prompt = `Answer the user's question without browsing. If freshness matters, add a disclaimer that this was generated without live search.\nQuestion: ${input.query}`;
      const { text } = await ai.generate({ prompt });
      return { content: (text ?? "").trim() };
    }
    try {
      const endpoint = new URL("https://www.googleapis.com/customsearch/v1");
      endpoint.searchParams.set("key", key);
      endpoint.searchParams.set("cx", cx);
      endpoint.searchParams.set("q", input.query);
      endpoint.searchParams.set("num", "5");
      const res = await fetch(endpoint);
      if (!res.ok) {
        let details = "";
        try {
          const errBody = await res.text();
          try {
            const errJson = JSON.parse(errBody);
            const code = errJson?.error?.code ?? res.status;
            const status = errJson?.error?.status ?? "";
            const message = errJson?.error?.message ?? "";
            details = `code=${code} status=${status} message=${message}`.trim();
          } catch {
            details = `status=${res.status} body=${String(errBody).slice(0, 200)}`;
          }
        } catch {}
        throw new Error(`Google CSE HTTP ${res.status}${details ? ` (${details})` : ""}`);
      }
      const data: any = await res.json();
      const items: any[] = data.items ?? [];
      const citations = items.slice(0, 5).map((it) => `- ${it.title} (${it.link})`);
      const summaryPrompt = `Using the following top web results, write a concise answer. Cite 2-3 sources at the end.\n\nQuery: ${input.query}\n\nSources:\n${citations.join("\n")}`;
      const { text } = await ai.generate({ prompt: summaryPrompt });
      return { content: (text ?? "").trim() };
    } catch (e: any) {
      const reason = typeof e?.message === "string" ? e.message : "unknown error";
      // Emit a server-side log for troubleshooting (no secrets included)
      console.error("WebSearchFlow: Google CSE error:", reason);
      const fallbackPrompt = `Web search (Google CSE) failed (${reason}). Provide the best answer you can without browsing. Add a short note that search failed and suggest checking official sources.\nQuestion: ${input.query}`;
      const { text } = await ai.generate({ prompt: fallbackPrompt });
      return { content: (text ?? "").trim() };
    }
  }
);

// Code Evaluation Flow (no execution by default; analysis only)
// Removed: code-evaluation and model-inference (not used in this project)

// Orchestrated Travel Assistant Flow
// Ideal workflow: extract preferences -> research -> recommend -> itinerary
export const TravelAssistantInputSchema = z.object({
  query: z.string().min(1),
  days: z.number().int().min(1).max(14).optional(),
});
export const TravelAssistantOutputSchema = z.object({
  preferences: z.string(),
  research: z.string(),
  recommendations: z.string(),
  itinerary: z.string(),
});

export const travelAssistantFlow = ai.defineFlow(
  {
    name: "travelAssistantFlow",
    inputSchema: TravelAssistantInputSchema,
    outputSchema: TravelAssistantOutputSchema,
  },
  async (input: z.infer<typeof TravelAssistantInputSchema>) => {
    // 1) Extract preferences
    const prefsRes = await customerQueryFlow({ query: input.query });
    const preferences = (prefsRes?.content ?? "").trim();

    // 2) Research using web search (or LLM fallback)
    const researchRes = await webSearchFlow({ query: input.query });
    const research = (researchRes?.content ?? "").trim();

    // 3) Destination recommendations using preferences + research
    const recPrompt = `Recommend 3 travel destinations based on the user's extracted preferences and the latest research. For each, include 2 pros and 1 con and a one-line rationale.\n\nPreferences:\n${preferences}\n\nResearch:\n${research}`;
    const recRes = await destinationRecommendationFlow({ prompt: recPrompt });
    const recommendations = (recRes?.content ?? "").trim();

    // 4) Choose best destination and days, then generate itinerary
    // Try to extract a destination and days value from recommendations/preferences via a lightweight JSON parseable step
    const defaultDays = input.days ?? 3;
    const extractPrompt = `From the recommendations below, pick ONE best destination name (city/region/country) and a duration in days (integer).\nIf the user's preferences mention a duration, use that; otherwise default to ${defaultDays}.\n\nPreferences:\n${preferences}\n\nRecommendations:\n${recommendations}\n\nReturn ONLY strict JSON like: {"destination":"Tokyo","days":3}`;
    const { text: extractText } = await ai.generate({ prompt: extractPrompt });
    let destination = "Tokyo";
    let days = defaultDays;
    try {
      const parsed = JSON.parse((extractText ?? "").trim());
      if (parsed && typeof parsed.destination === "string" && parsed.destination.length > 0) {
        destination = parsed.destination;
      }
      if (parsed && Number.isInteger(parsed.days)) {
        days = parsed.days;
      }
    } catch {
      // ignore parse errors; fall back to defaults
    }

    const itinRes = await itineraryPlanningFlow({ destination, days });
    const itinerary = (itinRes?.content ?? "").trim();

    return { preferences, research, recommendations, itinerary };
  }
);
