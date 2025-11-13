import { z } from "genkit";
import { ai } from "../../ai.js";

export const CostAgentInputSchema = z.object({
  flights: z.object({
    priceRange: z.object({
      min: z.number(),
      max: z.number(),
      currency: z.string(),
    }).optional(),
  }).optional(),
  hotels: z.object({
    priceRange: z.object({
      min: z.number(),
      max: z.number(),
      currency: z.string(),
    }).optional(),
  }).optional(),
  activities: z.object({
    activities: z.array(z.object({
      price: z.string().optional(),
    })),
  }).optional(),
  days: z.number().default(7),
});

export const CostAgentOutputSchema = z.object({
  breakdown: z.object({
    flights: z.string().optional(),
    accommodation: z.string().optional(),
    meals: z.string().optional(),
    activities: z.string().optional(),
    transportation: z.string().optional(),
    total: z.string().optional(),
  }),
  currency: z.string(),
});

export const costAgent = ai.defineFlow(
  {
    name: "costAgent",
    inputSchema: CostAgentInputSchema,
    outputSchema: CostAgentOutputSchema,
  },
  async (input) => {
  try {
    // Extract currency from flights or hotels
    const currency = input.flights?.priceRange?.currency || input.hotels?.priceRange?.currency || "USD";

    // Calculate flight costs (use average of range)
    let flightCost = 0;
    if (input.flights?.priceRange) {
      flightCost = (input.flights.priceRange.min + input.flights.priceRange.max) / 2;
    }

    // Calculate hotel costs (nightly rate * days)
    let hotelCost = 0;
    if (input.hotels?.priceRange) {
      const avgNightly = (input.hotels.priceRange.min + input.hotels.priceRange.max) / 2;
      hotelCost = avgNightly * input.days;
    }

    // Estimate meals (assume $50-80/day per person depending on destination)
    const mealCostPerDay = currency === "EUR" || currency === "GBP" ? 70 : 60;
    const mealCost = mealCostPerDay * input.days;

    // Calculate activities cost
    let activityCost = 0;
    if (input.activities?.activities) {
      const activityPrices = input.activities.activities
        .map((a: any) => parseFloat(a.price?.split(" ")[0] ?? ""))
        .filter((p: number) => !isNaN(p));
      if (activityPrices.length > 0) {
        activityCost = activityPrices.slice(0, input.days * 2).reduce((sum: number, p: number) => sum + p, 0);
      }
    }
    // Fallback estimate: $30-50/day per person
    if (activityCost === 0) {
      activityCost = 40 * input.days;
    }

    // Estimate local transportation ($15-25/day)
    const transportCost = 20 * input.days;

    // Total
    const total = flightCost + hotelCost + mealCost + activityCost + transportCost;

    return {
      breakdown: {
        flights: flightCost > 0 ? `${Math.round(flightCost)} ${currency}` : undefined,
        accommodation: hotelCost > 0 ? `${Math.round(hotelCost)} ${currency}` : undefined,
        meals: `${Math.round(mealCost)} ${currency}`,
        activities: `${Math.round(activityCost)} ${currency}`,
        transportation: `${Math.round(transportCost)} ${currency}`,
        total: `${Math.round(total)} ${currency}`,
      },
      currency,
    };
  } catch (e: any) {
    return {
      breakdown: {
        total: "Unable to calculate",
      },
      currency: "USD",
    };
  }
});
