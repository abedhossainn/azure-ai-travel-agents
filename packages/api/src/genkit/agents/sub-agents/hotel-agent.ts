import { z } from "genkit";
import { ai } from "../../ai.js";
import Amadeus from "amadeus";
import { withCache, getCacheKey, CACHE_TTL } from "../../../utils/cache.js";

// Lightweight currency inference
function inferCurrency({ destCountry, override }: { destCountry?: string; override?: string; }): string {
  if (override && /^[A-Z]{3}$/.test(override)) return override;
  const map: Record<string, string> = {
    US: "USD", CA: "CAD", GB: "GBP", UK: "GBP", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", PT: "EUR", NL: "EUR", IE: "EUR", BE: "EUR", AT: "EUR",
    CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", FI: "EUR", JP: "JPY", CN: "CNY", AU: "AUD", NZ: "NZD", TH: "THB", SG: "SGD", HK: "HKD", MX: "MXN",
    BR: "BRL", AR: "ARS", ZA: "ZAR", IN: "INR", KR: "KRW"
  };
  const norm = (c?: string) => (c || "").trim().toUpperCase();
  const d = norm(destCountry);
  if (d && map[d]) return map[d];
  return "USD";
}

export const HotelAgentInputSchema = z.object({
  cityCode: z.string().min(1),
  checkInDate: z.string().min(1),
  checkOutDate: z.string().min(1),
  adults: z.number().int().min(1).max(8).default(2),
  roomQuantity: z.number().int().min(1).max(4).default(1),
  currency: z.string().optional(),
  destCountry: z.string().optional(),
});

export const HotelSchema = z.object({
  name: z.string(),
  address: z.string().optional(),
  checkInDate: z.string(),
  checkOutDate: z.string(),
  price: z.string().optional(),
  rating: z.string().optional(),
  amenities: z.array(z.string()).optional(),
  url: z.string().optional(),
});

export const HotelAgentOutputSchema = z.object({
  hotels: z.array(HotelSchema),
  priceRange: z.object({
    min: z.number(),
    max: z.number(),
    currency: z.string(),
  }).optional(),
  summary: z.string().optional(),
});

export const hotelAgent = ai.defineFlow(
  {
    name: "hotelAgent",
    inputSchema: HotelAgentInputSchema,
    outputSchema: HotelAgentOutputSchema,
  },
  async (input) => {
    const clientId = process.env.AMADEUS_CLIENT_ID || process.env.KEY;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.SECRET;
    
    if (!clientId || !clientSecret) {
      // No credentials - return fallback hotels
      const currency = input.currency || inferCurrency({ destCountry: input.destCountry });

      const cityCode = (input.cityCode || '').toUpperCase();
      const nameMap: Record<string, string> = { LON: 'London', NYC: 'New York', PAR: 'Paris', ROM: 'Rome', TYO: 'Tokyo' };
      const cityName = nameMap[cityCode] || cityCode;

      // Very lightweight heuristic nightly ranges (economy / mid-range) for a few common destinations
      const rangeMap: Record<string, [number, number]> = {
        LON: [140, 280], // London
        NYC: [170, 320], // New York City (NYC cityCode varies, treating NYC)
        PAR: [150, 300], // Paris
        ROM: [120, 240], // Rome
        TYO: [130, 260], // Tokyo
      };
      const [min, max] = rangeMap[cityCode] || [110, 220];
      const mid = Math.round((min + max) / 2);

      // Construct 3–4 synthetic but plausible hotel entries
      const syntheticHotels = [
        {
          name: `${cityName} Central Comfort Hotel`,
          address: `${cityName} Downtown Area`,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          price: `${mid} ${currency}`,
          rating: "4",
          amenities: ["Free Wi-Fi", "Breakfast", "24h Front Desk"],
        },
        {
          name: `${cityName} Riverside Inn`,
          address: `${cityName} Riverside District`,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          price: `${min + Math.round((max - min) * 0.35)} ${currency}`,
          rating: "3",
          amenities: ["Wi-Fi", "Coffee Bar"],
        },
        {
          name: `${cityName} Executive Suites`,
          address: `${cityName} Business Quarter`,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          price: `${max - Math.round((max - min) * 0.15)} ${currency}`,
          rating: "4",
          amenities: ["Gym", "Wi-Fi", "Workspace"],
        },
        {
          name: `${cityName} Budget Stay Express`,
          address: `${cityName} Outer District`,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          price: `${min} ${currency}`,
          rating: "2",
          amenities: ["Wi-Fi"],
        },
      ];

      return {
        hotels: syntheticHotels,
        priceRange: { min, max, currency },
        summary: `Estimated nightly rates for ${cityName} (${input.checkInDate} – ${input.checkOutDate}). Live API unavailable – showing heuristic sample hotels. Book 3–6 weeks ahead and consider areas just outside the center for better value.`,
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
        destCountry: input.destCountry,
      });

      // Dynamically detect available hotel offers endpoint variants across SDK versions
      // hotelOffers endpoint requires hotelIds (not suitable for city search)
      // hotelOffersSearch is the correct endpoint for cityCode-based search
      const shopping = (amadeus as any).shopping || {};
      const endpointDescriptor: any = {
        hasHotelOffersSearch: !!shopping.hotelOffersSearch,
        hasHotelOffersSearchGet: !!shopping.hotelOffersSearch?.get,
      };
      let invokeHotelSearch: ((params: any) => Promise<any>) | null = null;
      // Prefer hotelOffersSearch.get for city-based search
      if (shopping.hotelOffersSearch?.get) {
        invokeHotelSearch = (params) => shopping.hotelOffersSearch.get(params);
      } else if (typeof shopping.hotelOffersSearch === "function") {
        invokeHotelSearch = (params) => shopping.hotelOffersSearch(params);
      }

      if (!invokeHotelSearch) {
        // No recognizable endpoint - provide fallback
        const code = (input.cityCode || '').toUpperCase();
        const nameMap: Record<string, string> = { LON: 'London', NYC: 'New York', PAR: 'Paris', ROM: 'Rome', TYO: 'Tokyo' };
        const cityName = nameMap[code] || code;
        const [min, max] = [120, 240];
        const mid = Math.round((min + max) / 2);
        return {
          hotels: [
            { name: `${cityName} SDK-Fallback Central`, address: `${cityName} Central District`, checkInDate: input.checkInDate, checkOutDate: input.checkOutDate, price: `${mid} ${currency}`, rating: "4", amenities: ["Wi-Fi", "Breakfast"] },
            { name: `${cityName} SDK-Fallback Budget`, address: `${cityName} Suburban Area`, checkInDate: input.checkInDate, checkOutDate: input.checkOutDate, price: `${min} ${currency}`, rating: "2", amenities: ["Wi-Fi"] },
            { name: `${cityName} SDK-Fallback Business`, address: `${cityName} Business Quarter`, checkInDate: input.checkInDate, checkOutDate: input.checkOutDate, price: `${max} ${currency}`, rating: "4", amenities: ["Gym", "Workspace", "Wi-Fi"] }
          ],
          priceRange: { min, max, currency },
          summary: `Live hotel API method unavailable for ${cityName}. Showing heuristic sample rates (SDK mismatch).`
        };
      }

      // Fetch from Amadeus with caching
      const cacheKey = getCacheKey("hotels", {
        cityCode: input.cityCode,
        checkInDate: input.checkInDate,
        checkOutDate: input.checkOutDate,
        adults: input.adults,
        roomQuantity: input.roomQuantity,
        currency,
      });

      const hotelData = await withCache(cacheKey, CACHE_TTL.HOTELS, async () => {
        try {
          const resp = await invokeHotelSearch!({
            cityCode: input.cityCode,
            checkInDate: input.checkInDate,
            checkOutDate: input.checkOutDate,
            adults: input.adults,
            roomQuantity: input.roomQuantity,
            currency,
          });
          return resp?.data ?? resp?.result ?? resp ?? [];
        } catch (inner) {
          throw inner;
        }
      });

      if (!hotelData || hotelData.length === 0) {
        return { 
          hotels: [], 
          summary: `No hotels found in ${input.cityCode} for ${input.checkInDate} - ${input.checkOutDate}` 
        };
      }

      // Parse and structure results
      const hotels = hotelData.slice(0, 8).map((h: any) => {
        const name = h?.hotel?.name || h?.name || "Hotel";
        const addr = [
          h?.hotel?.address?.lines?.join(" "),
          h?.hotel?.address?.cityName,
          h?.hotel?.address?.countryCode
        ].filter(Boolean).join(", ");
        const offer = (h?.offers ?? [])[0] || h?.offers;
        const price = offer?.price?.total && offer?.price?.currency 
          ? `${offer.price.total} ${offer.price.currency}` 
          : undefined;
        const rating = h?.hotel?.rating || undefined;
        const amenities = h?.hotel?.amenities?.slice(0, 5) || [];
        const url = offer?.url || undefined;

        return {
          name,
          address: addr || undefined,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          price,
          rating,
          amenities: amenities.length > 0 ? amenities : undefined,
          url,
        };
      });

      // Calculate price range
      const prices = hotels
        .map((h: any) => parseFloat(h.price?.split(" ")[0] ?? ""))
        .filter((p: number) => !isNaN(p));

      const priceRange = prices.length > 0 ? {
        min: Math.min(...prices),
        max: Math.max(...prices),
        currency,
      } : undefined;

      // Generate summary using LLM
      const sampleHotels = hotels.slice(0, 3).map((h: any) => 
        `${h.name}: ${h.price || "N/A"}/night${h.rating ? ` (${h.rating}⭐)` : ""}`
      ).join("\n");

      const { text: summaryText } = await ai.generate({
        prompt: `Summarize hotel options in ${input.cityCode} for ${input.adults} adult(s).
Check-in: ${input.checkInDate}, Check-out: ${input.checkOutDate}
Price range: ${priceRange ? `${priceRange.min}-${priceRange.max} ${priceRange.currency}/night` : "Various"}

Sample hotels:
${sampleHotels}

Provide a 2-3 sentence summary with booking tips (book 2-6 weeks ahead, consider areas outside Zone 1 for value).`,
      });

      return {
        hotels,
        priceRange,
        summary: summaryText?.trim() || undefined,
      };
    } catch (e: any) {
      // Fallback synthetic data (same as missing credentials) so UI isn't empty
      const currency = input.currency || inferCurrency({ destCountry: input.destCountry });
      const [min, max] = [120, 240];
      const mid = Math.round((min + max) / 2);
      const code = (input.cityCode || '').toUpperCase();
      const nameMap: Record<string, string> = { LON: 'London', NYC: 'New York', PAR: 'Paris', ROM: 'Rome', TYO: 'Tokyo' };
      const cityName = nameMap[code] || code;
      const syntheticHotels = [
        {
          name: `${cityName} Fallback Central Hotel`,
          address: `${cityName} Central District`,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          price: `${mid} ${currency}`,
          rating: "4",
          amenities: ["Wi-Fi", "Breakfast"],
        },
        {
          name: `${cityName} Fallback Budget Inn`,
          address: `${cityName} Suburban Area`,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          price: `${min} ${currency}`,
          rating: "2",
          amenities: ["Wi-Fi"],
        },
        {
          name: `${cityName} Fallback Business Suites`,
          address: `${cityName} Business Quarter`,
          checkInDate: input.checkInDate,
          checkOutDate: input.checkOutDate,
          price: `${max} ${currency}`,
          rating: "4",
          amenities: ["Gym", "Workspace", "Wi-Fi"],
        },
      ];
      return {
        hotels: syntheticHotels,
        priceRange: { min, max, currency },
        summary: `Live hotel search unavailable right now for ${cityName}. Showing estimated sample rates for planning.`,
      };
    }
  }
);
