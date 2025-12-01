/**
 * Register all Genkit flows for telemetry and dev UI
 * Import this file at startup to ensure all flows are discovered by Genkit
 * Updated: 2025-11-30 - Force rebuild
 */

// Import all flows to register them with Genkit
import { flightAgent } from "./agents/sub-agents/flight-agent.js";
import { hotelAgent } from "./agents/sub-agents/hotel-agent.js";
import { activitiesAgent } from "./agents/sub-agents/activities-agent.js";
import { itineraryAgent } from "./agents/sub-agents/itinerary-agent.js";
import { insightsAgent } from "./agents/sub-agents/insights-agent.js";
import { costAgent } from "./agents/sub-agents/cost-agent.js";
import { recommendationAgent } from "./agents/sub-agents/recommendation-agent.js";
import { masterAgent } from "./agents/sub-agents/master-agent.js";

// Export flows so they're accessible
export {
  flightAgent,
  hotelAgent,
  activitiesAgent,
  itineraryAgent,
  insightsAgent,
  costAgent,
  recommendationAgent,
  masterAgent,
};

console.log("✓ Registered 8 Genkit flows for telemetry");
