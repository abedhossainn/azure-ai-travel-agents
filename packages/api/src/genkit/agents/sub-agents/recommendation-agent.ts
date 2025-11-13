import { z } from "genkit";
import { ai } from "../../ai.js";

export const RecommendationAgentInputSchema = z.object({
  query: z.string().min(1),
  preferences: z.string().optional(),
  budget: z.string().optional(),
  season: z.string().optional(),
});

export const RecommendationAgentOutputSchema = z.object({
  recommendations: z.array(z.object({
    destination: z.string(),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
    rationale: z.string(),
    bestFor: z.string().optional(),
  })),
  summary: z.string().optional(),
});

export const recommendationAgent = ai.defineFlow(
  {
    name: "recommendationAgent",
    inputSchema: RecommendationAgentInputSchema,
    outputSchema: RecommendationAgentOutputSchema,
  },
  async (input) => {
    try {
      // Extract preferences from query if not provided
      let preferences = input.preferences;
      if (!preferences) {
        const { text: prefsText } = await ai.generate({
          prompt: `Extract travel preferences from the following query. Return concise bullet points covering: destination type, activities, budget, travel style, group size, special requirements.

Query: ${input.query}`,
        });
        preferences = prefsText?.trim() || "";
      }

      // Generate destination recommendations
      const prompt = `Based on the following travel preferences, recommend 3 destinations. For each destination, provide:
- 2 specific pros (be detailed and relevant)
- 1 realistic con
- A one-sentence rationale explaining why it fits
- What type of traveler it's best for

Preferences:
${preferences}

${input.budget ? `Budget: ${input.budget}` : ""}
${input.season ? `Travel Season: ${input.season}` : ""}

Return ONLY strict JSON array:
[
  {
    "destination": "City/Region, Country",
    "pros": ["Specific pro 1", "Specific pro 2"],
    "cons": ["Realistic con"],
    "rationale": "Brief explanation of why this fits",
    "bestFor": "Type of traveler this suits"
  },
  ...
]`;

      const { text: recText } = await ai.generate({ prompt });
      
      // Parse JSON response
      let recommendations: any[] = [];
      try {
        const parsed = JSON.parse(recText?.trim() || "[]");
        recommendations = Array.isArray(parsed) ? parsed : [];
      } catch {
        // Fallback: parse as markdown if JSON fails
        recommendations = [{
          destination: "Unable to parse recommendations",
          pros: ["Please try rephrasing your query"],
          cons: ["Parsing error occurred"],
          rationale: recText?.slice(0, 200) || "Error",
          bestFor: "N/A",
        }];
      }

      // Generate summary
      const summaryPrompt = `Summarize these ${recommendations.length} destination recommendations in 2-3 sentences. Focus on the variety and what makes each unique.

Destinations: ${recommendations.map((r: any) => r.destination).join(", ")}`;

      const { text: summaryText } = await ai.generate({ prompt: summaryPrompt });

      return {
        recommendations: recommendations.map((r: any) => ({
          destination: r.destination || "Unknown",
          pros: Array.isArray(r.pros) ? r.pros : [],
          cons: Array.isArray(r.cons) ? r.cons : [],
          rationale: r.rationale || "",
          bestFor: r.bestFor || undefined,
        })),
        summary: summaryText?.trim() || undefined,
      };
    } catch (e: any) {
      return {
        recommendations: [],
        summary: `Failed to generate recommendations: ${e.message?.slice(0, 100) || "unknown error"}`,
      };
    }
  }
);
