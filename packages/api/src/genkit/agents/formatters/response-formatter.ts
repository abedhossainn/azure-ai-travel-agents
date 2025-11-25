/**
 * Response formatter for multi-agent travel planning
 * Formats sub-agent outputs into the target structure
 */

interface FlightData {
  flights: Array<{
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    price?: string;
    airline?: string;
    duration?: string;
    cabin?: string;
    aircraft?: string;
  }>;
  priceRange?: {
    min: number;
    max: number;
    currency: string;
  };
  summary?: string;
}

interface HotelData {
  hotels: Array<{
    name: string;
    address?: string;
    checkInDate: string;
    checkOutDate: string;
    price?: string;
    rating?: string;
    amenities?: string[];
    url?: string;
  }>;
  priceRange?: {
    min: number;
    max: number;
    currency: string;
  };
  summary?: string;
}

interface ActivityData {
  activities: Array<{
    title: string;
    snippet?: string;
    price?: string;
    vendor?: string;
    url?: string;
    rating?: string;
  }>;
  summary?: string;
}

interface ItineraryData {
  itinerary: string;
  days: number;
}

interface InsightsData {
  insights: {
    weather?: string;
    crowds?: string;
    currency?: string;
    transit?: string;
    events?: string;
    diningTips?: string;
  };
  summary?: string;
}

interface CostData {
  breakdown: {
    flights?: string;
    accommodation?: string;
    meals?: string;
    activities?: string;
    transportation?: string;
    total?: string;
  };
  currency: string;
}

interface RecommendationData {
  recommendations: Array<{
    destination: string;
    pros: string[];
    cons: string[];
    rationale: string;
    bestFor?: string;
  }>;
  summary?: string;
}

interface MasterAgentResponse {
  flights?: FlightData;
  hotels?: HotelData;
  activities?: ActivityData;
  itinerary?: ItineraryData;
  insights?: InsightsData;
  cost?: CostData;
  recommendations?: RecommendationData;
  destination?: string;
  origin?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Format flight details section
 */
export function formatFlightSection(data: FlightData, origin?: string, destination?: string): string {
  console.log(`[FORMAT] formatFlightSection called, hasFlights=${Boolean(data.flights)}, flightsLength=${data.flights?.length || 0}`);
  
  if (!data.flights || data.flights.length === 0) {
    console.log(`[FORMAT] No flights data to format`);
    return "";
  }

  const sections: string[] = [];
  sections.push("## ✈️ **Flight Details**\n");

  if (data.summary) {
    sections.push(data.summary + "\n");
  }

  if (data.priceRange) {
    sections.push(`**Price Range:** ${data.priceRange.min}-${data.priceRange.max} ${data.priceRange.currency} (for 2 adults)\n`);
  }

  // Show top 3 flight options
  const topFlights = data.flights.slice(0, 3);
  sections.push("**Sample Flights:**\n");
  topFlights.forEach((f, idx) => {
    sections.push(`${idx + 1}. **${f.airline || "Airline"}** — ${f.origin} → ${f.destination}`);
    sections.push(`   - Departure: ${f.departureDate}${f.returnDate ? `, Return: ${f.returnDate}` : ""}`);
    if (f.price) sections.push(`   - Price: ${f.price}`);
    if (f.duration) sections.push(`   - Duration: ${f.duration}`);
    if (f.cabin) sections.push(`   - Cabin: ${f.cabin}`);
    sections.push("");
  });

  return sections.join("\n");
}

/**
 * Format hotel accommodation section
 */
export function formatHotelSection(data: HotelData): string {
  if (!data.hotels || data.hotels.length === 0) {
    return "";
  }

  const sections: string[] = [];
  sections.push("## 🏨 **Accommodation**\n");

  if (data.summary) {
    sections.push(data.summary + "\n");
  }

  if (data.priceRange) {
    sections.push(`**Price Range:** ${data.priceRange.min}-${data.priceRange.max} ${data.priceRange.currency}/night\n`);
  }

  // Show top 3 hotel options
  const topHotels = data.hotels.slice(0, 3);
  sections.push("**Recommended Hotels:**\n");
  topHotels.forEach((h, idx) => {
    sections.push(`${idx + 1}. **${h.name}**${h.rating ? ` (${h.rating}⭐)` : ""}`);
    if (h.address) sections.push(`   - ${h.address}`);
    if (h.price) sections.push(`   - Price: ${h.price}/night`);
    if (h.amenities && h.amenities.length > 0) {
      sections.push(`   - Amenities: ${h.amenities.slice(0, 3).join(", ")}`);
    }
    sections.push("");
  });

  return sections.join("\n");
}

/**
 * Format activities section
 */
export function formatActivitiesSection(data: ActivityData): string {
  if (!data.activities || data.activities.length === 0) {
    return "";
  }

  const sections: string[] = [];
  sections.push("## 🎭 **Activities & Attractions**\n");

  if (data.summary) {
    sections.push(data.summary + "\n");
  }

  // Show top 8 activities
  const topActivities = data.activities.slice(0, 8);
  topActivities.forEach((a, idx) => {
    sections.push(`${idx + 1}. **${a.title}**${a.price ? ` — ${a.price}` : ""}`);
    if (a.snippet) sections.push(`   ${a.snippet.slice(0, 200)}`);
    if (a.vendor) sections.push(`   *Provider: ${a.vendor}*`);
    sections.push("");
  });

  return sections.join("\n");
}

/**
 * Format day-by-day itinerary section
 */
export function formatItinerarySection(data: ItineraryData, destination?: string): string {
  if (!data.itinerary) {
    return "";
  }

  return `## 🗓️ **Day-by-Day Itinerary**\n\n${data.itinerary}\n`;
}

/**
 * Format travel insights section
 */
export function formatInsightsSection(data: InsightsData): string {
  const sections: string[] = [];
  sections.push("## 💡 **Smart Travel Insights**\n");

  let summary = data.summary || "";
  let insights = { ...(data.insights || {}) } as Required<InsightsData>["insights"];

  // If summary contains a fenced code block with JSON, attempt to parse and extract fields
  if (summary) {
    const fencedMatch = summary.match(/```(?:json)?\n([\s\S]*?)```/i);
    const rawCandidate = fencedMatch ? fencedMatch[1] : summary.trim();
    if (/^\{[\s\S]*\}$/.test(rawCandidate)) {
      try {
        const parsed = JSON.parse(rawCandidate);
        // Only adopt keys we recognize if original insights missing them
        const keys: (keyof typeof insights)[] = ["weather","crowds","currency","transit","events","diningTips"];
        let adopted = false;
        keys.forEach(k => {
          if (!insights[k] && typeof parsed[k] === "string") {
            insights[k] = parsed[k];
            adopted = true;
          }
        });
        if (adopted) {
          // Remove JSON block from summary to avoid duplication
          summary = summary.replace(fencedMatch ? fencedMatch[0] : rawCandidate, "").trim();
        }
      } catch {/* ignore parse errors */}
    }
  }

  if (summary) {
    sections.push(summary + "\n");
  }

  const nonEmpty = Object.entries(insights).filter(([_, v]) => !!v);
  if (nonEmpty.length) {
    sections.push("**Key Points:**\n");
    if (insights.weather) sections.push(`- **Weather:** ${insights.weather}`);
    if (insights.crowds) sections.push(`- **Crowds:** ${insights.crowds}`);
    if (insights.currency) sections.push(`- **Currency:** ${insights.currency}`);
    if (insights.transit) sections.push(`- **Transit:** ${insights.transit}`);
    if (insights.events) sections.push(`- **Events:** ${insights.events}`);
    if (insights.diningTips) sections.push(`- **Dining Tips:** ${insights.diningTips}`);
    sections.push("");
  }

  // Provide gentle follow-up CTA
  sections.push("*Need cost optimization, off-the-beaten-path ideas, or seasonal packing tips? Just ask!*\n");

  return sections.join("\n");
}

/**
 * Format destination recommendations section
 */
export function formatRecommendationsSection(data: RecommendationData): string {
  if (!data.recommendations || data.recommendations.length === 0) {
    return "";
  }

  const sections: string[] = [];
  sections.push("## 🌍 **Recommended Destinations**\n");

  if (data.summary) {
    sections.push(data.summary + "\n");
  }

  data.recommendations.forEach((rec, idx) => {
    sections.push(`### ${idx + 1}. ${rec.destination}\n`);
    
    if (rec.bestFor) {
      sections.push(`*Best for: ${rec.bestFor}*\n`);
    }
    
    sections.push("**Pros:**");
    rec.pros.forEach(pro => {
      sections.push(`- ${pro}`);
    });
    sections.push("");
    
    sections.push("**Cons:**");
    rec.cons.forEach(con => {
      sections.push(`- ${con}`);
    });
    sections.push("");
    
    if (rec.rationale) {
      sections.push(`*${rec.rationale}*\n`);
    }
    
    sections.push("---\n");
  });

  return sections.join("\n");
}

/**
 * Format cost breakdown section
 */
export function formatCostSection(data: CostData): string {
  const sections: string[] = [];
  sections.push("## 💵 **Estimated Trip Cost**\n");

  const breakdown = data.breakdown;
  sections.push("| Category | Estimated Cost |");
  sections.push("| -------- | -------------- |");
  
  if (breakdown.flights) sections.push(`| Flights | ${breakdown.flights} |`);
  if (breakdown.accommodation) sections.push(`| Accommodation | ${breakdown.accommodation} |`);
  if (breakdown.meals) sections.push(`| Meals | ${breakdown.meals} |`);
  if (breakdown.activities) sections.push(`| Activities | ${breakdown.activities} |`);
  if (breakdown.transportation) sections.push(`| Transportation | ${breakdown.transportation} |`);
  if (breakdown.total) sections.push(`| **Total** | **${breakdown.total}** |`);
  sections.push("");

  sections.push(`*All rates in ${data.currency}. Prices refreshed via live Amadeus data.*\n`);

  return sections.join("\n");
}

/**
 * Format full response from master agent output
 */
export function formatFullResponse(response: MasterAgentResponse): string {
  const sections: string[] = [];

  // Header
  const destName = response.destination || "Your Destination";
  const originName = response.origin || "Your City";
  sections.push(`# 🌍 **${destName} Trip Plan**\n`);
  
  if (response.startDate) {
    sections.push(`**Travel Dates:** ${response.startDate}${response.endDate ? ` to ${response.endDate}` : ""}`);
  }
  if (response.origin) {
    sections.push(`**Departure City:** ${originName}\n`);
  }
  sections.push("---\n");

  // Flight Details
  if (response.flights) {
    sections.push(formatFlightSection(response.flights, response.origin, response.destination));
    sections.push("---\n");
  }

  // Accommodation
  if (response.hotels) {
    sections.push(formatHotelSection(response.hotels));
    sections.push("---\n");
  }

  // Activities
  if (response.activities) {
    sections.push(formatActivitiesSection(response.activities));
    sections.push("---\n");
  }

  // Recommendations
  if (response.recommendations) {
    sections.push(formatRecommendationsSection(response.recommendations));
    sections.push("---\n");
  }

  // Itinerary
  if (response.itinerary) {
    sections.push(formatItinerarySection(response.itinerary, response.destination));
    sections.push("---\n");
  }

  // Insights
  if (response.insights) {
    sections.push(formatInsightsSection(response.insights));
    sections.push("---\n");
  }

  // Cost Breakdown
  if (response.cost) {
    sections.push(formatCostSection(response.cost));
  }

  return sections.join("\n");
}

/**
 * Format lean response (single section only)
 */
export function formatLeanResponse(response: MasterAgentResponse, section: "flights" | "hotels" | "activities"): string {
  const sections: string[] = [];

  if (section === "flights" && response.flights) {
    sections.push(formatFlightSection(response.flights, response.origin, response.destination));
    sections.push("\n*Would you like hotel recommendations, activities, or a full itinerary? Just ask!*");
  } else if (section === "hotels" && response.hotels) {
    sections.push(formatHotelSection(response.hotels));
    sections.push("\n*Would you like flight options, activities, or a day-by-day itinerary? Just ask!*");
  } else if (section === "activities" && response.activities) {
    sections.push(formatActivitiesSection(response.activities));
    sections.push("\n*Would you like flight and hotel options, or a full trip plan? Just ask!*");
  }

  return sections.join("\n");
}
