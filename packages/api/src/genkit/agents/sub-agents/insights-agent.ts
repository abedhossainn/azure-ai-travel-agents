import { z } from "genkit";
import { ai } from "../../ai.js";

export const InsightsAgentInputSchema = z.object({
  destination: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  currency: z.string().optional(),
});

export const InsightsAgentOutputSchema = z.object({
  insights: z.object({
    weather: z.string().optional(),
    crowds: z.string().optional(),
    currency: z.string().optional(),
    transit: z.string().optional(),
    events: z.string().optional(),
    diningTips: z.string().optional(),
  }),
  summary: z.string().optional(),
});

export const insightsAgent = ai.defineFlow(
  {
    name: "insightsAgent",
    inputSchema: InsightsAgentInputSchema,
    outputSchema: InsightsAgentOutputSchema,
  },
  async (input) => {
    try {
      // Generate smart travel insights using LLM
      const prompt = `Provide smart travel insights for ${input.destination} during ${input.startDate}${input.endDate ? ` to ${input.endDate}` : ""}.

Generate insights for:
1. **Weather**: Expected conditions, temperature range, what to pack
2. **Crowds**: Peak tourist season assessment, booking recommendations
3. **Currency**: Exchange rate tips${input.currency ? ` (${input.currency})` : ""}, cash vs card
4. **Transit**: Best local transport options, metro/bus tips, passes
5. **Events**: Any local festivals, holidays, or special events during dates
6. **Dining Tips**: Reservation timing, tipping customs, local food scene

Return as JSON:
{
  "weather": "...",
  "crowds": "...",
  "currency": "...",
  "transit": "...",
  "events": "...",
  "diningTips": "..."
}`;

      const { text: insightsText } = await ai.generate({ prompt });
      
      // Parse JSON response
      let insights = {
        weather: undefined,
        crowds: undefined,
        currency: undefined,
        transit: undefined,
        events: undefined,
        diningTips: undefined,
      };

      try {
        // Strip code fences if present
        let jsonText = insightsText?.trim() || "{}";
        const fenceMatch = jsonText.match(/```(?:json)?\s*\n([\s\S]*?)```/i);
        if (fenceMatch) {
          jsonText = fenceMatch[1].trim();
        }
        
        const parsed = JSON.parse(jsonText);
        insights = {
          weather: parsed.weather || undefined,
          crowds: parsed.crowds || undefined,
          currency: parsed.currency || undefined,
          transit: parsed.transit || undefined,
          events: parsed.events || undefined,
          diningTips: parsed.diningTips || undefined,
        };
      } catch (e: any) {
        // Failed to parse JSON - use raw text as summary
        return {
          insights: {},
          summary: insightsText?.trim() || "No insights available",
        };
      }

      // Generate summary
      const summaryPrompt = `Create a 2-3 sentence travel insights summary for ${input.destination} in ${input.startDate.split("-")[1]}/${input.startDate.split("-")[0]}.
Key points: ${insights.weather || ""} | ${insights.crowds || ""} | ${insights.transit || ""}`;

      const { text: summaryText } = await ai.generate({ prompt: summaryPrompt });

      return {
        insights,
        summary: summaryText?.trim() || undefined,
      };
    } catch (e: any) {
      return {
        insights: {},
        summary: `Failed to generate insights: ${e.message?.slice(0, 100) || "unknown error"}`,
      };
    }
  }
);
