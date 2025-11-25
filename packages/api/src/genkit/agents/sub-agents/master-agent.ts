import { z } from "genkit";
import { ai } from "../../ai.js";
import Amadeus from "amadeus";
import { performance } from "node:perf_hooks";
import { withCache, getCacheKey, CACHE_TTL } from "../../../utils/cache.js";
import { flightAgent, FlightAgentOutputSchema } from "./flight-agent.js";
import { hotelAgent, HotelAgentOutputSchema } from "./hotel-agent.js";
import { activitiesAgent, ActivitiesAgentOutputSchema } from "./activities-agent.js";
import { itineraryAgent, ItineraryAgentOutputSchema } from "./itinerary-agent.js";
import { insightsAgent, InsightsAgentOutputSchema } from "./insights-agent.js";
import { costAgent, CostAgentOutputSchema } from "./cost-agent.js";
import { recommendationAgent, RecommendationAgentOutputSchema } from "./recommendation-agent.js";

// Sanitize Amadeus keywords
function sanitizeAmadeusKeyword(input: string, fallback = "LONDON"): string {
  if (!input) return fallback;
  const cleaned = input
    .normalize("NFKD")
    .replace(/[^a-zA-Z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return cleaned && cleaned.length >= 3 ? cleaned : fallback;
}

export const MasterAgentInputSchema = z.object({
  query: z.string().min(1),
  // Intent flags
  needsFlights: z.boolean().default(false),
  needsHotels: z.boolean().default(false),
  needsActivities: z.boolean().default(false),
  needsItinerary: z.boolean().default(false),
  needsInsights: z.boolean().default(false),
  needsCost: z.boolean().default(false),
  needsRecommendations: z.boolean().default(false),
  // Context params
  origin: z.string().optional(),
  originIata: z.string().optional(),
  destination: z.string().optional(),
  destIata: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  adults: z.number().int().min(1).max(8).default(2),
  currency: z.string().optional(),
});

export const MasterAgentOutputSchema = z.object({
  flights: FlightAgentOutputSchema.optional(),
  hotels: HotelAgentOutputSchema.optional(),
  activities: ActivitiesAgentOutputSchema.optional(),
  itinerary: ItineraryAgentOutputSchema.optional(),
  insights: InsightsAgentOutputSchema.optional(),
  cost: CostAgentOutputSchema.optional(),
  recommendations: RecommendationAgentOutputSchema.optional(),
  // Metadata
  destination: z.string().optional(),
  origin: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const masterAgent = ai.defineFlow(
  {
    name: "masterAgent",
    inputSchema: MasterAgentInputSchema,
    outputSchema: MasterAgentOutputSchema,
  },
  async (input) => {
    try {
      const clientId = process.env.AMADEUS_CLIENT_ID || process.env.KEY;
      const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.SECRET;
      
      if (!clientId || !clientSecret) {
        return { 
          destination: input.destination,
          origin: input.origin,
          startDate: input.startDate,
          endDate: input.endDate,
        };
      }

      const amadeus = new (Amadeus as any)({
        clientId,
        clientSecret,
        hostname: process.env.AMADEUS_HOST || "test",
      });

      // Resolve destination coordinates and IATA (if needed for sub-agents)
      // Avoid hard-coded London fallback bleeding into unrelated queries.
      let destLat: number | null = null;
      let destLon: number | null = null;
      let destIata = input.destIata || "";
      let destCountry = "";

      // Country -> Capital mapping (minimal set; extend as needed)
      const countryCapitalMap: Record<string, { city: string; iata: string; lat: number; lon: number; }> = {
        SPAIN: { city: "Madrid", iata: "MAD", lat: 40.4168, lon: -3.7038 },
        FRANCE: { city: "Paris", iata: "PAR", lat: 48.8566, lon: 2.3522 },
        ITALY: { city: "Rome", iata: "ROM", lat: 41.9028, lon: 12.4964 },
        UNITEDKINGDOM: { city: "London", iata: "LON", lat: 51.5074, lon: -0.1278 },
        UK: { city: "London", iata: "LON", lat: 51.5074, lon: -0.1278 },
        GERMANY: { city: "Berlin", iata: "BER", lat: 52.52, lon: 13.4050 },
        PORTUGAL: { city: "Lisbon", iata: "LIS", lat: 38.7223, lon: -9.1393 },
        JAPAN: { city: "Tokyo", iata: "TYO", lat: 35.6762, lon: 139.6503 },
        UNITEDSTATES: { city: "New York", iata: "NYC", lat: 40.7128, lon: -74.0060 },
      };

      if (input.destination) {
        const rawDest = input.destination.trim();
        const countryLike = rawDest.replace(/\s+/g, '').toUpperCase();
        // If user supplied a country (e.g., "Spain"), map to capital to avoid London default.
        if (countryCapitalMap[countryLike]) {
          const cap = countryCapitalMap[countryLike];
            destLat = cap.lat;
            destLon = cap.lon;
            destIata = cap.iata;
            destCountry = countryLike.slice(0,2); // ISO approximation (first two letters)
        } else {
          const destKeyword = sanitizeAmadeusKeyword(rawDest, "");
          if (destKeyword) {
            const locationCacheKey = getCacheKey("location", { destination: destKeyword });
            const city = await withCache(locationCacheKey, CACHE_TTL.LOCATIONS, async () => {
              const locResp = await (amadeus as any).referenceData.locations.get({
                keyword: destKeyword,
                subType: "CITY",
              });
              return (locResp?.data ?? [])[0];
            });
            if (city) {
              destLat = city.geoCode?.latitude ?? destLat;
              destLon = city.geoCode?.longitude ?? destLon;
              destIata = city.iataCode || city.address?.cityCode || destIata;
              destCountry = city.address?.countryCode || city.countryCode || destCountry;
            }
          }
        }
      }

      // If still unresolved, do NOT inject default London; leave null so downstream logic can decide to skip activities/hotels.
      const hasResolvedDestination = !!destIata || (destLat !== null && destLon !== null);

      // Resolve origin IATA (if needed for flights)
      let originIata = input.originIata || "";
      let originCountry = "";
      if (input.origin && (input.needsFlights || !originIata)) {
        // Normalize common shorthand (e.g., "DC" -> Washington) before sanitizing
        let originRaw = input.origin.trim();
        if (/^dc$/i.test(originRaw) || /washington\s*dc/i.test(originRaw)) {
          originRaw = "Washington"; // Amadeus keyword for WAS metro area
        }
        const originKeyword = sanitizeAmadeusKeyword(originRaw, "");
        if (originKeyword) {
          const originCacheKey = getCacheKey("location", { destination: originKeyword });
          const originCity = await withCache(originCacheKey, CACHE_TTL.LOCATIONS, async () => {
            const resp = await (amadeus as any).referenceData.locations.get({
              keyword: originKeyword,
              subType: "CITY,AIRPORT",
            });
            return (resp?.data ?? [])[0];
          });
          
          if (originCity) {
            originIata = originCity.iataCode || originIata;
            originCountry = originCity.address?.countryCode || originCity.countryCode || "";
          }
        }
      }

      // Build sub-agent task list based on intent flags
      const tasks: { key: string; promise: Promise<any> }[] = [];

      // Small helper to time sub-agent promises; logs METRIC lines for parsing
      function timedTask<T>(key: string, p: Promise<T>): Promise<T> {
        const start = performance.now();
        const writeMetric = (line: string) => {
          try {
            // Always log to console
            console.log(line);
            // Also append to local-reports/modified-api.log so offline scripts can parse reliably
            // Note: process.cwd() here is packages/api; ../../local-reports resolves to repo/local-reports
            const fs = require('fs');
            const path = require('path');
            const outPath = path.resolve(process.cwd(), '../../local-reports/modified-api.log');
            fs.mkdirSync(path.dirname(outPath), { recursive: true });
            fs.appendFileSync(outPath, line + '\n');
          } catch {
            // ignore file append errors
          }
        };
        return p.then((res) => {
          const dur = Math.round(performance.now() - start);
          writeMetric(`METRIC: SUBAGENT ${key} durationMs=${dur}`);
          return res;
        }).catch((err) => {
          writeMetric(`METRIC: SUBAGENT ${key} ERROR=${err?.message || "unknown"}`);
          throw err;
        });
      }

      if (input.needsFlights && originIata && destIata && input.startDate) {
        tasks.push({
          key: "flights",
          promise: timedTask("flights", flightAgent.run({
            origin: originIata,
            destination: destIata,
            departureDate: input.startDate,
            returnDate: input.endDate,
            adults: input.adults,
            currency: input.currency,
            originCountry,
            destCountry,
          })),
        });
      }

      if (input.needsHotels && destIata && input.startDate && input.endDate) {
        tasks.push({
          key: "hotels",
          promise: timedTask("hotels", hotelAgent.run({
            cityCode: destIata.slice(0, 3),
            checkInDate: input.startDate,
            checkOutDate: input.endDate,
            adults: input.adults,
            roomQuantity: 1,
            currency: input.currency,
            destCountry,
          })),
        });
      }

      if (input.needsActivities) {
        if (!hasResolvedDestination || destLat == null || destLon == null) {
          // Skip activities - destination not fully resolved
        } else {
        tasks.push({
          key: "activities",
          promise: timedTask("activities", activitiesAgent.run({
            latitude: destLat!,
            longitude: destLon!,
            radius: 30,
          })),
        });
        }
      }

      if (input.needsItinerary && input.destination && input.startDate && input.endDate) {
        // Itinerary needs activities and hotels context, so wait for those first if requested
        const activityPromise = tasks.find(t => t.key === "activities")?.promise;
        const hotelPromise = tasks.find(t => t.key === "hotels")?.promise;
        
        tasks.push({
          key: "itinerary",
          promise: timedTask("itinerary", (async () => {
            const [activityData, hotelData] = await Promise.all([
              activityPromise || Promise.resolve(null),
              hotelPromise || Promise.resolve(null),
            ]);
            return itineraryAgent.run({
              destination: input.destination!,
              startDate: input.startDate!,
              endDate: input.endDate!,
              activities: activityData?.activities,
              hotels: hotelData?.hotels,
            });
          })()),
        });
      }

      if (input.needsInsights && input.destination && input.startDate) {
        tasks.push({
          key: "insights",
          promise: timedTask("insights", insightsAgent.run({
            destination: input.destination,
            startDate: input.startDate,
            endDate: input.endDate,
            currency: input.currency,
          })),
        });
      }

      if (input.needsRecommendations) {
        tasks.push({
          key: "recommendations",
          promise: timedTask("recommendations", recommendationAgent.run({
            query: input.query,
          })),
        });
      }

      // Execute all sub-agents in parallel
      const results = await Promise.all(tasks.map(t => t.promise));

      // Map results back to named sections
      const response: any = {
        destination: input.destination,
        origin: input.origin,
        startDate: input.startDate,
        endDate: input.endDate,
      };
      
      // Unwrap .result from Genkit flow responses
      tasks.forEach((task, idx) => {
        const flowResult = results[idx];
        // Genkit .run() returns {result, telemetry}, extract just the result
        response[task.key] = flowResult?.result ?? flowResult;
      });

      // If cost breakdown requested and we have data, calculate it
      if (input.needsCost && (response.flights || response.hotels)) {
        const days = input.startDate && input.endDate 
          ? Math.max(1, Math.ceil((new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) / (1000 * 60 * 60 * 24)))
          : 7;
        
        try {
          const costResult = await timedTask("cost", costAgent.run({
            flights: response.flights,
            hotels: response.hotels,
            activities: response.activities,
            days,
          }));
          // Unwrap .result from Genkit flow response
          response.cost = costResult?.result ?? costResult;
        } catch (costError: any) {
          console.log(`[COST AGENT] Skipped due to error: ${costError?.message || "unknown"}`);
          // Cost calculation is optional - continue without it
        }
      }

      return response;
    } catch (e: any) {
      return {
        destination: input.destination,
        origin: input.origin,
        startDate: input.startDate,
        endDate: input.endDate,
      };
    }
  }
);
