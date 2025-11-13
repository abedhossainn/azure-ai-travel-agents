import { z } from "genkit";
import { ai } from "../../ai.js";
import Amadeus from "amadeus";
import { withCache, getCacheKey, CACHE_TTL } from "../../../utils/cache.js";

export const ActivitiesAgentInputSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  radius: z.number().default(30),
});

export const ActivitySchema = z.object({
  title: z.string(),
  snippet: z.string().optional(),
  price: z.string().optional(),
  vendor: z.string().optional(),
  url: z.string().optional(),
  rating: z.string().optional(),
});

export const ActivitiesAgentOutputSchema = z.object({
  activities: z.array(ActivitySchema),
  summary: z.string().optional(),
});

export const activitiesAgent = ai.defineFlow(
  {
    name: "activitiesAgent",
    inputSchema: ActivitiesAgentInputSchema,
    outputSchema: ActivitiesAgentOutputSchema,
  },
  async (input) => {
    const clientId = process.env.AMADEUS_CLIENT_ID || process.env.KEY;
      const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.SECRET;

      if (!clientId || !clientSecret) {
        // No credentials - return fallback activities      // Very lightweight geo inference for a couple of well-known city centers (only for labeling)
      const lat = input.latitude;
      const lon = input.longitude;
      let cityLabel = "this area";
      if (lat > 40 && lat < 41 && lon > -74.3 && lon < -73.5) cityLabel = "New York"; // NYC approx
      if (lat > 48.7 && lat < 49.1 && lon > 2.1 && lon < 2.5) cityLabel = "Paris"; // Paris approx
      if (lat > 51 && lat < 52 && lon > -0.5 && lon < 0.3) cityLabel = "London"; // London approx
      if (lat > 35.5 && lat < 35.9 && lon > 139.4 && lon < 139.9) cityLabel = "Tokyo"; // Tokyo approx

      const syntheticActivities = [
        { title: `Historic Walking Tour of ${cityLabel}`, snippet: `Guided stroll through key landmarks of ${cityLabel}.`, price: "$25", vendor: "LocalTours" },
  { title: `Museum Afternoon in ${cityLabel}`, snippet: `Explore a top museum; pre-book tickets to skip the line.`, price: "$18", vendor: "CityMuseum" },
        { title: `Food Tasting Market Experience`, snippet: "Sample regional specialties and street snacks.", price: "$35", vendor: "TasteCo" },
        { title: `Evening River or Skyline View`, snippet: "Enjoy panoramic city views near sunset.", price: "$0-20", vendor: "ScenicCo" },
        { title: `Local Neighborhood Coffee Crawl`, snippet: "Discover indie cafés and roasters.", price: "$10-25", vendor: "CaféTrail" },
        { title: `Signature Monument Photo Stop`, snippet: "Visit the iconic landmark early to avoid crowds.", price: "$0-30", vendor: "Self-Guided" },
      ].map(a => ({ ...a, url: `https://www.google.com/maps/search/${encodeURIComponent(a.title)}` }));

      return {
        activities: syntheticActivities,
        summary: `Estimated sample activities for ${cityLabel}. Live API unavailable – combining paid and free options. Plan a balance of 1 paid and 2 free experiences per day.`,
      };
    }

    try {
      const amadeus = new (Amadeus as any)({
        clientId,
        clientSecret,
        hostname: process.env.AMADEUS_HOST || "test",
      });

      // Fetch from Amadeus with caching
      const cacheKey = getCacheKey("activities", {
        lat: input.latitude,
        lon: input.longitude,
        radius: input.radius,
      });

      const activityData = await withCache(cacheKey, CACHE_TTL.ACTIVITIES, async () => {
        const resp = await (amadeus as any).shopping.activities.get({
          latitude: input.latitude,
          longitude: input.longitude,
          radius: input.radius,
        });
        return resp?.data ?? [];
      });

      if (!activityData || activityData.length === 0) {
        return { 
          activities: [], 
          summary: `No activities found near coordinates (${input.latitude}, ${input.longitude})` 
        };
      }

      // Parse and structure results
      const activities = activityData.slice(0, 12).map((a: any) => {
        const title = a?.name || "Activity";
        const rawDesc = (a?.shortDescription || a?.description || "").toString();
        const stripped = rawDesc.replace(/<[^>]*>/g, " ");
        const desc = stripped.slice(0, 400).replace(/\s+/g, " ");
        const price = a?.price?.amount ? `${a.price.amount} ${a?.price?.currency || ""}` : undefined;
        const vendor = a?.provider?.name || a?.vendor || undefined;
        const link = a?.bookingLink || a?.url || undefined;
        const rating = a?.rating || undefined;

        return {
          title,
          snippet: desc || undefined,
          price,
          vendor,
          url: link || `https://www.google.com/maps/search/${encodeURIComponent(title)}`,
          rating,
        };
      });

      // Generate summary using LLM
      const sampleActivities = activities.slice(0, 5).map((a: any) => 
        `${a.title}${a.price ? ` - ${a.price}` : ""}${a.vendor ? ` (${a.vendor})` : ""}`
      ).join("\n");

      const { text: summaryText } = await ai.generate({
        prompt: `Summarize activity options near coordinates (${input.latitude}, ${input.longitude}).

Sample activities:
${sampleActivities}

Provide a 2-3 sentence summary covering types of experiences (museums, tours, outdoor activities) and typical pricing. Include tip: mix 1 paid + 2 free activities per day.`,
      });

      return {
        activities,
        summary: summaryText?.trim() || undefined,
      };
    } catch (e: any) {
      // Fallback synthetic data so UI isn't empty
      const syntheticActivities = [
        { title: "Fallback City Walking Tour", snippet: "Introductory walk covering major highlights.", price: "$25", vendor: "LocalTours" },
        { title: "Fallback Museum Visit", snippet: "Explore a leading cultural collection.", price: "$15-25", vendor: "CityMuseum" },
        { title: "Fallback Street Food Tasting", snippet: "Sample local bites at a popular market.", price: "$30", vendor: "TasteCo" },
        { title: "Fallback Sunset Viewpoint", snippet: "Panoramic skyline or river lookout.", price: "$0-15", vendor: "ScenicCo" },
        { title: "Fallback Coffee & Pastry Crawl", snippet: "Discover indie cafés and bakeries.", price: "$15-20", vendor: "CaféTrail" },
      ].map(a => ({ ...a, url: `https://www.google.com/maps/search/${encodeURIComponent(a.title)}` }));
      return {
        activities: syntheticActivities,
        summary: "Live activity search unavailable right now. Showing estimated sample experiences for planning.",
      };
    }
  }
);
