import { z } from "genkit";
import { ai } from "../ai.js";
import Amadeus from "amadeus";

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
    // Amadeus-backed research: find destination, fetch activities, summarize
    const clientId = process.env.AMADEUS_CLIENT_ID || process.env.KEY;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.SECRET;
    if (!clientId || !clientSecret) {
      const prompt = `Answer the user's question without browsing. Live data is unavailable (Amadeus not configured).\nQuestion: ${input.query}`;
      const { text } = await ai.generate({ prompt });
      return { content: (text ?? "").trim() };
    }
    const amadeus = new (Amadeus as any)({
      clientId,
      clientSecret,
      hostname: process.env.AMADEUS_HOST || "test", // use 'production' when ready
    });

    // Extract a destination city/region from the query
    // Neutral and explicit extraction for destination; check inline "Destination:" first
    let destination = "";
    const inlineMatch = /Destination:\s*([^\n]+)/i.exec(input.query || "");
    if (inlineMatch && inlineMatch[1]) destination = inlineMatch[1].trim();
    if (!destination) {
      const { text: destText } = await ai.generate({
        prompt: `From the user's query below, extract ONE destination city, region, or country name (e.g., London, Edinburgh, Bath, UK, Paris, Tokyo, Bangkok). Return ONLY the name, no extra text.\n\nQuery: ${input.query}`,
      });
      destination = (destText ?? "").split(/\n|,/)[0].trim();
    }
    if (!destination) destination = "London";
    try {
      // Resolve destination to coordinates
      const locResp = await (amadeus as any).referenceData.locations.get({
        keyword: destination.toUpperCase(),
        subType: "CITY",
      });
      const city = (locResp?.data ?? [])[0];
      const lat = city?.geoCode?.latitude ?? 13.7563; // default Bangkok
      const lon = city?.geoCode?.longitude ?? 100.5018;

      // Fetch activities near destination
      const actResp = await (amadeus as any).shopping.activities.get({
        latitude: lat,
        longitude: lon,
        radius: 30,
      });
      const acts: any[] = actResp?.data ?? [];
      if (!acts.length) {
        const prompt = `No activities were found via Amadeus near ${destination}. Provide the best answer you can without browsing.\nQuestion: ${input.query}`;
        const { text } = await ai.generate({ prompt });
        return { content: (text ?? "").trim() };
      }

      // Build a compact context of activities
      const activityLines = acts.slice(0, 10).map((a: any, i: number) => {
        const price = a?.price?.amount ? `${a.price.amount} ${a?.price?.currency || ""}` : "N/A";
        const vendor = a?.provider?.name || a?.vendor || "";
        const desc = (a?.shortDescription || a?.description || "").toString().slice(0, 240).replace(/\s+/g, " ");
        const link = a?.bookingLink || a?.url || "";
        return `#${i + 1} ${a?.name || "Activity"} — ${desc}${price !== "N/A" ? ` | ${price}` : ""}${vendor ? ` | ${vendor}` : ""}${link ? ` | ${link}` : ""}`;
      });

  const prompt = `You are a travel research assistant using live Amadeus activities for ${destination}. The user asked: ${input.query}.\nBased on the activities below, write a concise, practical research note covering: typical activity costs, types of experiences, and tips for staying within budget and season considerations for the user's timeframe. End with 3 bullet "Suggestions" and a short list of 2-3 citeable activity names (no external links).\n\nActivities:\n${activityLines.join("\n")}`;
      const { text } = await ai.generate({ prompt });
      return { content: (text ?? "").trim() };
    } catch (e: any) {
      const reason = typeof e?.message === "string" ? e.message : "unknown error";
      console.error("WebSearchFlow (Amadeus) error:", reason);
      const { text } = await ai.generate({ prompt: `Amadeus lookup failed (${reason}). Provide the best answer you can without live data.\nQuestion: ${input.query}` });
      return { content: (text ?? "").trim() };
    }
  }
);

// Structured Web Search Flow - returns summary + structured sources
const ActivitySchema = z.object({
  title: z.string(),
  url: z.string().optional().default(""),
  snippet: z.string().optional().default(""),
  extract: z.string().optional().default(""),
  price: z.string().optional(),
  vendor: z.string().optional(),
});
const FlightSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  departureDate: z.string(),
  returnDate: z.string().optional(),
  price: z.string().optional(),
  airline: z.string().optional(),
  url: z.string().optional(),
});
const HotelSchema = z.object({
  name: z.string(),
  address: z.string().optional(),
  checkInDate: z.string().optional(),
  checkOutDate: z.string().optional(),
  price: z.string().optional(),
  url: z.string().optional(),
});

export const WebSearchStructuredOutputSchema = z.object({
  summary: z.string(),
  destination: z.string().optional(),
  origin: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  results: z
    .object({
      activities: z.array(ActivitySchema).default([]),
      flights: z.array(FlightSchema).default([]),
      hotels: z.array(HotelSchema).default([]),
    })
    .default({ activities: [], flights: [], hotels: [] }),
});
export const WebSearchStructuredInputSchema = z.object({
  query: z.string().min(1),
  destination: z.string().optional(),
  month: z.string().optional(),
});
export const webSearchStructuredFlow = ai.defineFlow(
  {
    name: "webSearchStructuredFlow",
    inputSchema: WebSearchStructuredInputSchema,
    outputSchema: WebSearchStructuredOutputSchema,
  },
  async (input: z.infer<typeof WebSearchStructuredInputSchema>) => {
    try {
  const clientId = process.env.AMADEUS_CLIENT_ID || process.env.KEY;
      const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.SECRET;
      if (!clientId || !clientSecret) {
        const { text } = await ai.generate({ prompt: `Answer the user's question without browsing. Live data is unavailable (Amadeus not configured).\nQuestion: ${input.query}` });
        return { summary: (text ?? "").trim(), results: { activities: [], flights: [], hotels: [] } };
      }

      const amadeus = new (Amadeus as any)({
        clientId,
        clientSecret,
        hostname: process.env.AMADEUS_HOST || "test",
      });

      // Prefer explicitly provided destination (e.g., from extracted preferences)
      let destination = (input.destination || "").trim();
      if (!destination) {
        // Check for explicit "Destination: X" in the query text
        const m = /Destination:\s*([^\n]+)/i.exec(input.query || "");
        if (m && m[1]) destination = m[1].trim();
      }
      if (!destination) {
        // Neutral, unbiased extraction (avoid biasing to Thailand)
        const { text: destText } = await ai.generate({
          prompt: `From the user's query below, extract ONE destination city, region, or country name (e.g., London, Edinburgh, Bath, UK, Paris, Tokyo, Bangkok). Return ONLY the name, no extra text.\n\nQuery: ${input.query}`,
        });
        destination = (destText ?? "").split(/\n|,/)[0].trim();
      }
      if (!destination) destination = "London";

      // Resolve destination to coordinates
      const locResp = await (amadeus as any).referenceData.locations.get({
        keyword: destination.toUpperCase(),
        subType: "CITY",
      });
      const city = (locResp?.data ?? [])[0];
      const lat = city?.geoCode?.latitude ?? 13.7563;
      const lon = city?.geoCode?.longitude ?? 100.5018;

      // Fetch activities
      const actResp = await (amadeus as any).shopping.activities.get({
        latitude: lat,
        longitude: lon,
        radius: 30,
      });
      const acts: any[] = actResp?.data ?? [];
      const activities = acts.slice(0, 12).map((a: any) => {
        const price = a?.price?.amount ? `${a.price.amount} ${a?.price?.currency || ""}` : "";
        const desc = (a?.shortDescription || a?.description || "").toString().slice(0, 400).replace(/\s+/g, " ");
        const link = a?.bookingLink || a?.url || "";
        const title = a?.name || "Activity";
        const extract = [desc, price ? `Price: ${price}` : "", link ? `Link: ${link}` : ""].filter(Boolean).join(" | ");
        return {
          title,
          url: link || `https://www.google.com/maps/search/${encodeURIComponent(title + " " + destination)}`,
          snippet: desc,
          extract,
          price: price || undefined,
        };
      });

      // If no activities, return fallback summary with explanation
      if (activities.length === 0) {
        const { text } = await ai.generate({ 
          prompt: `**Important Note:** Live data for ${destination} is not available in the Amadeus test database. This may be because the test API has limited coverage (major cities like Paris, London, New York work, but smaller destinations or specific regions may not).

Provide a helpful travel plan for: ${input.query}

Include:
1. A realistic budget breakdown
2. Typical activity suggestions
3. Flight and hotel price estimates based on general knowledge
4. Seasonal considerations

Start with: "**Important Note:** Live data failed, so this is a general plan based on typical costs and popular attractions."` 
        });
        return { summary: (text ?? "").trim(), results: { activities: [], flights: [], hotels: [] } };
      }

      // Extract origin and dates from the user's query (per-search, no hardcoded month)
      const { text: paramsText } = await ai.generate({
        prompt: `Extract structured travel parameters from the user's query. Return ONLY strict JSON with keys:
{"origin":"IATA or city (e.g., YYZ or Toronto)","adults":2,"startDate":"YYYY-MM-DD|optional","endDate":"YYYY-MM-DD|optional","month":"Full month name|optional","year":2025,"days":7}.
If unknown, omit the key. Query: ${input.query}`,
      });
      let originGuess = /toronto/i.test(input.query) ? "YYZ" : "";
      try {
        const p = JSON.parse((paramsText ?? "{}").trim());
        if (typeof p?.origin === "string" && p.origin.trim()) originGuess = p.origin.trim();
      } catch {}

      const originLoc = await (async () => {
        if (!originGuess) return undefined;
        try {
          const resp = await (amadeus as any).referenceData.locations.get({ keyword: originGuess.toUpperCase(), subType: "CITY,AIRPORT" });
          return (resp?.data ?? [])[0];
        } catch { return undefined; }
      })();
  const originIata: string = originLoc?.iataCode || (originGuess ? originGuess.toUpperCase() : "");
      const destIata: string = city?.iataCode || (city?.address?.cityCode ?? "BKK");

      // Dates: derive from query parameters
      let startDate: string | undefined;
      let endDate: string | undefined;
      let tripDays = 7;
      try {
        const p = JSON.parse((paramsText ?? "{}").trim());
        if (typeof p?.startDate === "string" && /\d{4}-\d{2}-\d{2}/.test(p.startDate)) startDate = p.startDate;
        if (typeof p?.endDate === "string" && /\d{4}-\d{2}-\d{2}/.test(p.endDate)) endDate = p.endDate;
        if (Number.isInteger(p?.days)) tripDays = p.days;
        // If only month is provided, choose a deterministic date in that month (10th)
        if (!startDate && typeof p?.month === "string" && p.month.trim()) {
          const monthName = p.month.trim();
          const now = new Date();
          const monthIndex = ["january","february","march","april","may","june","july","august","september","october","november","december"].indexOf(monthName.toLowerCase());
          const year = Number.isInteger(p?.year) ? p.year : (monthIndex !== -1 && monthIndex < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear());
          if (monthIndex !== -1) {
            const m = String(monthIndex + 1).padStart(2, '0');
            startDate = `${year}-${m}-10`;
          }
        }
      } catch {}

      // If startDate still missing, choose ~6 weeks from now
      if (!startDate) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + 42);
        startDate = d.toISOString().slice(0, 10);
      }
      // Compute endDate if missing
      if (!endDate) {
        const d = new Date(startDate + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() + Math.max(1, tripDays));
        endDate = d.toISOString().slice(0, 10);
      }
      const departDate = startDate;
      const returnDate = endDate;

      // Flights (sample)
      let flights: Array<{ origin: string; destination: string; departureDate: string; returnDate?: string; price?: string; airline?: string; url?: string; }> = [];
      try {
        if (originIata && destIata) {
          const resp = await (amadeus as any).shopping.flightOffersSearch.get({
            originLocationCode: originIata,
            destinationLocationCode: destIata,
            departureDate: departDate,
            returnDate,
            adults: 2,
            currencyCode: /toronto|canada/i.test(input.query) ? "CAD" : "USD",
            max: 5,
          });
          const data: any[] = resp?.data ?? [];
          flights = data.slice(0, 5).map((f: any) => {
            const price = f?.price?.total && f?.price?.currency ? `${f.price.total} ${f.price.currency}` : undefined;
            const carrier = f?.validatingAirlineCodes?.[0] || f?.itineraries?.[0]?.segments?.[0]?.carrierCode;
            return { origin: originIata, destination: destIata, departureDate: departDate, returnDate, price, airline: carrier };
          });
        }
      } catch {}

      // Hotels (sample)
      let hotels: Array<{ name: string; address?: string; checkInDate?: string; checkOutDate?: string; price?: string; url?: string; }> = [];
      try {
        const hresp = await (amadeus as any).shopping.hotelOffers.get({
          cityCode: city?.address?.cityCode || destIata.slice(0, 3),
          checkInDate: departDate,
          checkOutDate: returnDate,
          adults: 2,
          roomQuantity: 1,
          currency: /toronto|canada/i.test(input.query) ? "CAD" : "USD",
        });
        const hdata: any[] = hresp?.data ?? [];
        hotels = hdata.slice(0, 8).map((h: any) => {
          const name = h?.hotel?.name || h?.name || "Hotel";
          const addr = [h?.hotel?.address?.lines?.join(" "), h?.hotel?.address?.cityName, h?.hotel?.address?.countryCode].filter(Boolean).join(", ");
          const offer = (h?.offers ?? [])[0] || h?.offers;
          const price = offer?.price?.total && offer?.price?.currency ? `${offer.price.total} ${offer.price.currency}` : undefined;
          const url = offer?.url || undefined;
          return { name, address: addr || undefined, checkInDate: departDate, checkOutDate: returnDate, price, url };
        });
      } catch {}

      const bullets = activities.slice(0, 8).map((r, i) => `#${i + 1} ${r.title} — ${r.extract}`);
      const { text } = await ai.generate({
        prompt: `You are a travel research assistant using Amadeus live data for ${destination}. The user asked: ${input.query}.\nCreate a concise research summary covering: types of activities (with typical prices), flight price range for 2 adults (origin ${originIata || "Unknown"}), and 2-3 sample hotel price points for the same dates. Include seasonal tips for the travel timeframe if mentioned. End with 3 budget suggestions and cite 2-3 activity or hotel names (no external links).\n\nActivities:\n${bullets.join("\n")}\n\nFlights (sample):\n${flights.map((f) => `- ${f.origin}->${f.destination} ${f.departureDate}${f.returnDate ? `/${f.returnDate}` : ""} ${f.price || ""} ${f.airline || ""}`).join("\n")}\n\nHotels (sample):\n${hotels.slice(0,5).map((h)=>`- ${h.name} ${h.price || ""}`).join("\n")}`,
      });
  return { summary: (text ?? "").trim(), destination, origin: originIata || undefined, startDate: departDate, endDate: returnDate, results: { activities, flights, hotels } };
    } catch (e: any) {
      const reason = typeof e?.message === "string" ? e.message : "unknown error";
      console.error("WebSearchStructuredFlow (Amadeus) error:", reason);
      console.error("Error details:", e.response?.body || e);
      
      const { text } = await ai.generate({ 
        prompt: `**Important Note:** Live data lookup failed due to: ${reason}. This may be because:
1. The destination is not available in the Amadeus test API database
2. The test API has limited coverage (major cities work better)
3. There was a temporary API issue

Provide a helpful travel plan for: ${input.query}

Include realistic budget estimates, activity suggestions, and seasonal tips based on general knowledge.
Start with: "**Important Note:** Live data failed (${reason.slice(0, 50)}), so this plan is based on general knowledge and typical costs."` 
      });
      return { summary: (text ?? "").trim(), results: { activities: [], flights: [], hotels: [] } };
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

    // Parse destination/month from extracted preferences to guide research
    const prefDestMatch = /Destination:\s*([^\n]+)/i.exec(preferences || "");
    const destinationForResearch = prefDestMatch ? prefDestMatch[1].trim() : undefined;
    const prefMonthMatch = /Month:\s*([^\n]+)/i.exec(preferences || "");
    const monthForResearch = prefMonthMatch ? prefMonthMatch[1].trim() : undefined;

    // 2) Research using structured web search (guided by preferences when available)
    const researchRes = await webSearchStructuredFlow({ query: input.query, destination: destinationForResearch, month: monthForResearch });
    const research = (researchRes?.summary ?? "").trim();

    // Extract a candidate destination from preferences or research (fallback-safe)
  const prefMatch = /Destination:\s*([^\n]+)/i.exec(preferences || "");
  const destinationFromPrefs = prefMatch ? prefMatch[1].trim() : "";
    const destinationFromResearch = (researchRes as any)?.destination || "";
    // If neither exists, try a quick LLM extraction from the raw query
    let destinationCandidate = destinationFromPrefs || destinationFromResearch;
    if (!destinationCandidate) {
      const { text: qDest } = await ai.generate({ prompt: `From the user's query below, extract ONE destination city or region name (e.g., London, Tokyo, Bangkok). Return ONLY the name.\n\nQuery: ${input.query}` });
      destinationCandidate = (qDest ?? "").split(/\n|,/)[0].trim();
    }

    // 3) Destination recommendations using preferences + research
    const recPrompt = `Recommend 3 travel destinations based on the user's extracted preferences and the latest research. For each, include 2 pros and 1 con and a one-line rationale.\n\nPreferences:\n${preferences}\n\nResearch:\n${research}`;
    const recRes = await destinationRecommendationFlow({ prompt: recPrompt });
    const recommendations = (recRes?.content ?? "").trim();

    // 4) Choose best destination and days, then generate itinerary
    // Try to extract a destination and days value from recommendations/preferences via a lightweight JSON parseable step
    const defaultDays = input.days ?? 3;
    const extractPrompt = `From the recommendations below, pick ONE best destination name (city/region/country) and a duration in days (integer).\nIf the user's preferences mention a duration, use that; otherwise default to ${defaultDays}.\nPrefer this destination if coherent with recommendations: "${destinationCandidate || ""}".\n\nPreferences:\n${preferences}\n\nRecommendations:\n${recommendations}\n\nReturn ONLY strict JSON like: {"destination":"${destinationCandidate || "London"}","days":${defaultDays}}`;
    const { text: extractText } = await ai.generate({ prompt: extractPrompt });
    let destination = destinationCandidate || "";
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
      // ignore parse errors; fall back to candidate/defaults
    }
    if (!destination || !destination.trim()) {
      destination = destinationCandidate || "London";
    }

    const itinRes = await itineraryPlanningFlow({ destination, days });
    const itinerary = (itinRes?.content ?? "").trim();

    return { preferences, research, recommendations, itinerary };
  }
);
