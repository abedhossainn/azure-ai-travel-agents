import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";

// Initialize Genkit with Google Gemini provider.
// Uses GEMINI_API_KEY from environment by default.
export const ai = genkit({
  plugins: [googleAI()],
  // Default to the requested single model; can be overridden via env `model`
  model: googleAI.model((process.env.model || "gemini-2.5-flash-lite").replace(/^"|"$/g, ""), {
    temperature: 0.7,
  }),
});
