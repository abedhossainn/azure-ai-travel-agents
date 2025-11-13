import { z } from "genkit";
import { ai } from "../../ai.js";

export const ItineraryAgentInputSchema = z.object({
  destination: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  activities: z.array(z.object({
    title: z.string(),
    snippet: z.string().optional(),
    price: z.string().optional(),
  })).optional(),
  hotels: z.array(z.object({
    name: z.string(),
    address: z.string().optional(),
  })).optional(),
});

export const ItineraryAgentOutputSchema = z.object({
  itinerary: z.string(),
  days: z.number(),
});

export const itineraryAgent = ai.defineFlow(
  {
    name: "itineraryAgent",
    inputSchema: ItineraryAgentInputSchema,
    outputSchema: ItineraryAgentOutputSchema,
  },
  async (input) => {
    try {
      // Calculate trip duration
      const start = new Date(input.startDate + "T00:00:00Z");
      const end = new Date(input.endDate + "T00:00:00Z");
      const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

      // Build context from activities and hotels if available
      let contextSection = "";
      if (input.activities && input.activities.length > 0) {
        const actList = input.activities.slice(0, 10).map((a: any, i: number) => 
          `${i + 1}. ${a.title}${a.price ? ` (${a.price})` : ""}`
        ).join("\n");
        contextSection += `\n\nAvailable activities:\n${actList}`;
      }
      if (input.hotels && input.hotels.length > 0) {
        const hotelList = input.hotels.slice(0, 3).map((h: any) => 
          `${h.name}${h.address ? ` - ${h.address}` : ""}`
        ).join("\n");
        contextSection += `\n\nRecommended hotels:\n${hotelList}`;
      }

      // Generate day-by-day itinerary
      const prompt = `Create a detailed ${days}-day itinerary for ${input.destination}.
Dates: ${input.startDate} to ${input.endDate}

For each day, provide:
- **Morning**: One major activity or attraction with arrival time
- **Afternoon**: A complementary activity or cultural experience
- **Evening**: Dining recommendation or nighttime activity
- **Transit Tip**: Local transport or logistics advice

${contextSection}

Format each day as:
### Day X — Title (Date)
**Morning:** ...
**Afternoon:** ...
**Evening:** ...
**Transit Tip:** ...

Start with Day 1 arrival and end with Day ${days} departure logistics.`;

      const { text: itineraryText } = await ai.generate({ prompt });

      return {
        itinerary: itineraryText?.trim() || `${days}-day itinerary for ${input.destination}`,
        days,
      };
    } catch (e: any) {
      return {
        itinerary: `Failed to generate itinerary: ${e.message?.slice(0, 100) || "unknown error"}`,
        days: 1,
      };
    }
  }
);
