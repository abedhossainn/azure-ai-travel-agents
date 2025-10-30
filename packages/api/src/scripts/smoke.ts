/*
  Simple smoke test runner for Genkit-powered Travel Assistant API.
  Checks: health, v2/chat (orchestrated travel assistant)
*/

type Test = {
  name: string;
  run: () => Promise<void>;
};

const API = process.env.API_BASE_URL || "http://localhost:4000";

async function assert(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

async function getJson(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text}`);
  }
  return { status: res.status, json };
}

async function postJson(url: string, body: any) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text}`);
  }
  return { status: res.status, json };
}

const tests: Test[] = [
  {
    name: "health",
    run: async () => {
      const { status, json } = await getJson(`${API}/api/health`);
      await assert(status === 200, `health status ${status}`);
      await assert(json.status === "OK", `health body ${JSON.stringify(json)}`);
    },
  },
  {
    name: "v2/chat (orchestrated workflow)",
    run: async () => {
      const { status, json } = await postJson(`${API}/api/v2/chat`, {
        message: "Family trip in April under $2500, prefer beaches, flying from Toronto",
      });
      await assert(status === 200, `v2/chat status ${status}`);
      await assert(json.agent === "TravelAssistant", `v2/chat agent ${JSON.stringify(json)}`);
      await assert(typeof json.content === "string" && json.content.length > 0, `v2/chat content missing`);
      const sections = json.sections;
      await assert(sections && typeof sections === "object", `v2/chat sections missing`);
      await assert(typeof sections.preferences === "string", `v2/chat preferences missing`);
      await assert(typeof sections.research === "string", `v2/chat research missing`);
      await assert(typeof sections.recommendations === "string", `v2/chat recommendations missing`);
      await assert(typeof sections.itinerary === "string", `v2/chat itinerary missing`);
    },
  },
];

(async () => {
  let failures = 0;
  for (const t of tests) {
    try {
      await t.run();
      console.log(`PASS ${t.name}`);
    } catch (e: any) {
      failures++;
      console.error(`FAIL ${t.name}: ${e?.message || e}`);
    }
  }
  if (failures > 0) {
    process.exitCode = 1;
  }
})();
