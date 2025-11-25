import { z } from "genkit";
import { ai } from "../../ai.js";
import Amadeus from "amadeus";
import { withCache, getCacheKey, CACHE_TTL } from "../../../utils/cache.js";

// Lightweight currency inference
function inferCurrency({ originCountry, destCountry, override }: { originCountry?: string; destCountry?: string; override?: string; }): string {
  if (override && /^[A-Z]{3}$/.test(override)) return override;
  const map: Record<string, string> = {
    US: "USD", CA: "CAD", GB: "GBP", UK: "GBP", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", PT: "EUR", NL: "EUR", IE: "EUR", BE: "EUR", AT: "EUR",
    CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", FI: "EUR", JP: "JPY", CN: "CNY", AU: "AUD", NZ: "NZD", TH: "THB", SG: "SGD", HK: "HKD", MX: "MXN",
    BR: "BRL", AR: "ARS", ZA: "ZAR", IN: "INR", KR: "KRW"
  };
  const norm = (c?: string) => (c || "").trim().toUpperCase();
  const o = norm(originCountry);
  const d = norm(destCountry);
  if (o && map[o]) return map[o];
  if (d && map[d]) return map[d];
  return "USD";
}

export const FlightAgentInputSchema = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  departureDate: z.string().min(1),
  returnDate: z.string().optional(),
  adults: z.number().int().min(1).max(8).default(2),
  currency: z.string().optional(),
  originCountry: z.string().optional(),
  destCountry: z.string().optional(),
});

export const FlightSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  departureDate: z.string(),
  returnDate: z.string().optional(),
  price: z.string().optional(),
  airline: z.string().optional(),
  duration: z.string().optional(),
  cabin: z.string().optional(),
  aircraft: z.string().optional(),
});

export const FlightAgentOutputSchema = z.object({
  flights: z.array(FlightSchema),
  priceRange: z.object({
    min: z.number(),
    max: z.number(),
    currency: z.string(),
  }).optional(),
  summary: z.string().optional(),
});

export const flightAgent = ai.defineFlow(
  {
    name: "flightAgent",
    inputSchema: FlightAgentInputSchema,
    outputSchema: FlightAgentOutputSchema,
  },
  async (input) => {
  console.log(`[FLIGHT AGENT] Input:`, JSON.stringify(input, null, 2));
  
  const clientId = process.env.AMADEUS_CLIENT_ID || process.env.KEY;
      const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.SECRET;

      if (!clientId || !clientSecret) {
        // No credentials - use fallback      // Provide a reasonable estimated price range using heuristics
      const currency = input.currency || inferCurrency({ originCountry: input.originCountry, destCountry: input.destCountry });
      const base: Record<string, [number, number]> = {
        // Typical economy roundtrip ranges (rough estimates)
        "JFK-LON": [650, 1000],
      };
      const key = `${(input.origin || "").toUpperCase()}-${(input.destination || "").toUpperCase()}`;
      const [min, max] = base[key] || [550, 1100];
      return {
        flights: [
          {
            origin: input.origin,
            destination: input.destination,
            departureDate: input.departureDate,
            returnDate: input.returnDate,
            price: `${Math.round((min + max) / 2)} ${currency}`,
            airline: "Estimate",
            duration: "6h-8h (direct) / 9h-12h (1-stop)",
            cabin: "Economy",
          },
        ],
        priceRange: { min, max, currency },
        summary: `Estimated roundtrip economy fares for ${input.origin} → ${input.destination} (${input.departureDate}${input.returnDate ? ` to ${input.returnDate}` : ""}). Actual prices vary by airline and booking window.`,
      };
    }

    try {
      const amadeus = new (Amadeus as any)({
        clientId,
        clientSecret,
        hostname: process.env.AMADEUS_HOST || "test",
      });

      // Infer currency if not provided
      const currency = input.currency || inferCurrency({
        originCountry: input.originCountry,
        destCountry: input.destCountry,
      });

      // Fetch from Amadeus with caching
      const cacheKey = getCacheKey("flights", {
        origin: input.origin,
        destination: input.destination,
        departureDate: input.departureDate,
        returnDate: input.returnDate,
        adults: input.adults,
        currency,
      });

      const flightData = await withCache(cacheKey, CACHE_TTL.FLIGHTS, async () => {
        try {
          const resp = await (amadeus as any).shopping.flightOffersSearch.get({
            originLocationCode: input.origin,
            destinationLocationCode: input.destination,
            departureDate: input.departureDate,
            returnDate: input.returnDate,
            adults: input.adults,
            currencyCode: currency,
            max: 5,
          });
          console.log(`[FLIGHT AGENT] Amadeus response: ${resp?.data?.length || 0} offers`);
          return resp?.data ?? [];
        } catch (err: any) {
          console.error(`[FLIGHT AGENT] Amadeus API error:`, err.message, err.response?.statusCode);
          return [];
        }
      });

      console.log(`[FLIGHT AGENT] Flight data length: ${flightData?.length || 0}`);

      if (!flightData || flightData.length === 0) {
        console.log(`[FLIGHT AGENT] No flight data, returning empty`);
        return { 
          flights: [], 
          summary: `No flights found for ${input.origin} → ${input.destination} on ${input.departureDate}` 
        };
      }

      // Parse and structure results
      const flights = flightData.map((f: any) => {
        const price = f.price?.total && f.price?.currency ? `${f.price.total} ${f.price.currency}` : undefined;
        const airline = f.validatingAirlineCodes?.[0] || f.itineraries?.[0]?.segments?.[0]?.carrierCode;
        const duration = f.itineraries?.[0]?.duration;
        const cabin = f.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin;
        const aircraft = f.itineraries?.[0]?.segments?.[0]?.aircraft?.code;

        return {
          origin: input.origin,
          destination: input.destination,
          departureDate: input.departureDate,
          returnDate: input.returnDate,
          price,
          airline,
          duration,
          cabin,
          aircraft,
        };
      });

      // Calculate price range
      const prices = flights
        .map((f: any) => parseFloat(f.price?.split(" ")[0] ?? ""))
        .filter((p: number) => !isNaN(p));

      const priceRange = prices.length > 0 ? {
        min: Math.min(...prices),
        max: Math.max(...prices),
        currency,
      } : undefined;

      // Generate summary using LLM
      const sampleFlights = flights.slice(0, 3).map((f: any) => 
        `${f.airline || "Airline"}: ${f.price || "N/A"} (${f.duration || "N/A"}, ${f.cabin || "Economy"})`
      ).join("\n");

      const { text: summaryText } = await ai.generate({
        prompt: `Summarize flight options from ${input.origin} to ${input.destination} for ${input.adults} adult(s).
Departure: ${input.departureDate}${input.returnDate ? `, Return: ${input.returnDate}` : ""}
Price range: ${priceRange ? `${priceRange.min}-${priceRange.max} ${priceRange.currency}` : "Various"}

Sample flights:
${sampleFlights}

Provide a 2-3 sentence summary with booking tips (check +/- 3 days, compare direct vs 1-stop).`,
      });

      return {
        flights,
        priceRange,
        summary: summaryText?.trim() || undefined,
      };
    } catch (e: any) {
      // Fallback: provide an estimated range so UI isn't empty
      const currency = input.currency || inferCurrency({ originCountry: input.originCountry, destCountry: input.destCountry });
      const [min, max] = [600, 1050];
      return {
        flights: [
          {
            origin: input.origin,
            destination: input.destination,
            departureDate: input.departureDate,
            returnDate: input.returnDate,
            price: `${Math.round((min + max) / 2)} ${currency}`,
            airline: "Estimate",
            duration: "~7-11h",
            cabin: "Economy",
          },
        ],
        priceRange: { min, max, currency },
        summary: "Live flight search unavailable right now. Showing estimated prices for planning.",
      };
    }
  }
);
