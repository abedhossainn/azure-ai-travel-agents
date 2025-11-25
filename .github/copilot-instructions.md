# Copilot Instructions for azure-ai-travel-agents

## Big Picture Architecture

- The platform is a modular AI travel agent system, composed of multiple microservices ("tools") for itinerary planning, destination recommendations, customer queries, and more.
- The main API gateway is in `packages/api/`, with **three orchestration options**:
  - **LangChain.js** (current default) at `packages/api/src/orchestrator/langchain/`
  - **LlamaIndex.TS** (available alternative) at `packages/api/src/orchestrator/llamaindex/`
  - **Microsoft Agent Framework** (Python alternative) at `packages/api-python/`
- Each tool is isolated in its own directory under `packages/tools/` and communicates via HTTP APIs or Model Context Protocol (MCP).
- The frontend UI is in `packages/ui/` (Angular + Tailwind CSS), talking to the API gateway.
- Infrastructure is managed with Bicep templates in `infra/` and setup scripts in `infra/hooks/`.

## Developer Workflows

- **Build & Run All Services:**  
  Run `./run.sh` from the repo root to build and start all services locally via Docker Compose.
- **Service-Specific Development:**  
  Each tool under `packages/tools/` can be built and run independently using its language's standard commands (e.g., `npm`, `mvnw`, `python`).
- **UI Development:**  
  Run `npm start` in `packages/ui/` for local frontend development.
- **Infrastructure Deployment:**  
  Use Bicep files in `infra/` and scripts in `infra/hooks/` for Azure deployments.

## Project-Specific Conventions

- **Service Boundaries:**  
  Each tool is strictly separated; cross-service communication uses HTTP APIs or MCP protocol, not direct imports.
- **Orchestration Options:**  
  Three orchestrators available (all work with the same MCP tools):
  - **LangChain.js** (TypeScript) - Current default, uses LangGraph supervisor pattern with `@langchain/mcp-adapters`
  - **LlamaIndex.TS** (TypeScript) - Available alternative, good for RAG use cases
  - **Microsoft Agent Framework** (Python) - Alternative for Python-native teams
- **Configuration:**  
  Shared config files are in the repo root (`azure.yaml`, `repomix.config.json`). Service-specific configs are in their respective directories.
- **Testing:**  
  Tests are colocated with source files or follow language-specific conventions (e.g., `.spec.ts` for TypeScript, `test/` for Python).
- **Documentation:**  
  Key architectural docs are in `docs/` (see `docs/technical-architecture.md`, `docs/deployment-architecture.md`, `docs/orchestration.md`).

## Integration Points & External Dependencies

- **Azure Services:**  
  Provisioned via Bicep templates; see `infra/main.bicep`.
- **LLMs:**  
  Model integration details are in `llms.txt`.
  - **LangChain.js orchestrator**: `packages/api/src/orchestrator/langchain/providers/` (Azure OpenAI, Docker Models, GitHub Models, Ollama, Foundry Local)
  - **LlamaIndex.TS orchestrator**: `packages/api/src/orchestrator/llamaindex/`
  - **Microsoft Agent Framework**: `packages/api-python/src/orchestrator/`
- **MCP (Model Context Protocol):**  
  All tools implement MCP for standardized communication. MCP servers in `packages/tools/` (TypeScript, Python, C#, Java).

## Patterns & Examples

- **Adding a New Tool:**  
  Scaffold under `packages/tools/`, provide a `Dockerfile`, and register with the API gateway:
  - For **LangChain.js**: Update `packages/api/src/mcp/mcp-tools.ts` and `packages/api/src/orchestrator/langchain/tools/index.ts`
  - For **LlamaIndex.TS**: Update `packages/api/src/orchestrator/llamaindex/tools/index.ts`
  - For **Microsoft Agent Framework**: Update `packages/api-python/src/orchestrator/tools/tool_config.py`
- **Extending the UI:**  
  Add Angular components in `packages/ui/src/app/`, update routing as needed.
- **Service Communication:**  
  Use HTTP clients (see `packages/api/src/mcp/mcp-http-client.ts`) for inter-service calls via MCP protocol.
- **Switching Orchestrators:**  
  Change import in `packages/api/src/index.ts` from `./orchestrator/langchain/` to `./orchestrator/llamaindex/` or run `packages/api-python/` separately.

## Key Files & Directories

- `packages/api/` - API gateway and orchestrator logic
  - `src/orchestrator/langchain/` - **LangChain.js orchestrator (current default)**
  - `src/orchestrator/llamaindex/` - LlamaIndex.TS orchestrator (available alternative)
  - `src/mcp/` - MCP client implementation
- `packages/api-python/` - Python-based API with Microsoft Agent Framework orchestrator
- `packages/tools/` - MCP servers (microservices in TypeScript, Python, C#, Java)
- `packages/ui/` - Angular frontend
- `infra/` - Infrastructure as code (Bicep, setup scripts)
- `docs/` - Architecture and API documentation (see `docs/orchestration.md` for orchestrator comparison)

---

For further details, consult the `README.md` and documentation in `docs/`. If any section is unclear or missing, please provide feedback to improve these instructions.

## Genkit flows, contracts & developer notes

- Genkit is the orchestrator inside the API: see `packages/api/src/genkit/ai.ts` (provider + model) and `packages/api/src/genkit/agents/*` for flows.
- Master routing always goes through the `masterAgent` flow in `packages/api/src/genkit/agents/sub-agents/master-agent.ts`. The canonical routing helper is `routeQuery()` in `packages/api/src/utils/intent-router-v2.ts` which:
  - runs a quick lean check for single categories (flights/hotels/activities)
  - runs a small LLM intent classifier then calls `masterAgent` with flags
  - returns formatted output via `packages/api/src/genkit/agents/formatters/response-formatter.ts`

- When adding a sub-agent or flow:
  - Add in `packages/api/src/genkit/agents/sub-agents/` and export a z-validated input/output pair (use `ai.defineFlow`).
  - Use `withCache()` + `getCacheKey()` from `packages/api/src/utils/cache.ts` for any Amadeus API calls to save tokens and speed responses.
  - Add a top-level formatter in `formatters/response-formatter.ts` (HTML or markdown sections) so the UI and SSE streams stay consistent.

  ## Local Instrumentation & Benchmarks (developer-only)

  - Purpose: this repo includes small, local-only helpers to gather "before vs after" evidence when you modify orchestration, caching, or LLM providers. These helpers are not required for the service to run.
  - Where to look:
    - `packages/api/src/genkit/ai.ts` — instrumentation wraps `ai.generate()` with a light `METRIC: AI_CALL` counter for local cost/run proxies.
    - `packages/api/src/genkit/agents/sub-agents/master-agent.ts` — `METRIC: SUBAGENT <name> durationMs=<ms>` is logged for each sub-agent.
    - `packages/api/src/utils/cache.ts` — logs `✓ Cache HIT` / `✗ Cache MISS` and exposes `getCacheStats()` (exposed via `/api/health`).
    - `packages/api/src/scripts/benchmark.ts` — run repeated `POST /api/v2/chat` requests in cold and warm-cache modes and saves `benchmark-results.json`.
    - `packages/api/src/scripts/parse_logs.ts` — parses `api.log` to compute cache hit-rate and average sub-agent times.

  - How to run (local only):
    - Start API and Redis if needed: `./run.sh` (or `cd packages/api && npm start`) and `docker-compose up -d`
    - Run the benchmark collection (cold/warm):

  ```bash
  cd packages/api
  npm run build # optional - compile TS
  npx tsx src/scripts/benchmark.ts
  ```

  - After running, you can parse `api.log` (server stdout) and the `benchmark-results.json` file to summarize metrics. Example parse command:

  ```bash
  npm run parse-logs
  ```

  - Storage: local debugging artifacts are placed in `local-reports/` which is ignored by git automatically by `.gitignore`. Attach `local-reports/benchmark-results.json` and `api.log` to your report.

  ### Quick tips

  - The `METRIC:` prefixed log lines are simple to grep and aggregate (e.g., `grep "METRIC: SUBAGENT" api.log | wc -l`).
  - For reproducible "before vs after" runs, run the same benchmark script on both branches and compare `benchmark-results.json`.
  - Use `GET /api/health` to show whether `REDIS_URL` is configured and `getCacheStats()` connectivity.

  Benchmark scenarios and parity notes:

  - The benchmark harness now supports named scenarios (default: `simple_flight`, `recommendation`, `full_itinerary`). These are designed to exercise the different workflows the codebase supports (single-category flight queries, recommendation flows, and full itinerary orchestration).
  - Run the full scenario set against the modified branch (Genkit + Gemini) using:

  ```bash
  API_BASE=http://localhost:4000 API_PATH=/api/v2/chat npm --workspace azure-ai-travel-agents-api run benchmark
  ```

  - Run the same scenario set against the baseline branch (LlamaIndex + GitHub models). Baseline may require a `GITHUB_TOKEN` or `OPENAI_API_KEY` depending on your local setup. Example (baseline with LlamaIndex uses `/api/chat`):

  ```bash
  API_BASE=http://localhost:5001 API_PATH=/api/chat npm --workspace azure-ai-travel-agents-api run benchmark
  ```

  - If you don't want to use live API keys for the baseline, run the baseline with a temporarily-inserted `METRIC: AI_CALL` instrumentation to measure AI call duration, or use `MOCK=true` (if implemented) to stub LLM calls for network & cache comparisons.

  Comparing results:

  - The `compare` script groups by scenario and warm/cold runs and writes `benchmark-comparison.csv`.
  - The `plot` script (Python) renders a simple bar plot comparing average latency for modified vs baseline per scenario.
  - The `parse-logs` script extracts `METRIC: AI_CALL`, `METRIC: SUBAGENT`, and cache hit/miss lines from `api.log` so you can compare LLM-call counts and where time is spent in each run.

- Important contracts to respect:
  - Inputs: `masterAgent` expects flags like `needsFlights`, `needsHotels`, `needsActivities`, plus `origin`, `destination`, `startDate`, `endDate`, `adults`.
  - Outputs: Each sub-agent should produce a named key (e.g., `flights`, `hotels`, `activities`) that conforms to the TypeScript schemas in `packages/api/src/genkit/agents/formatters/response-formatter.ts`.
  - Error mode: flows should return partial responses on unknown errors (master-agent returns at least origin/destination/dates fields).

- Edge cases and rules observed in code:
  - Master agent will skip activities if destination resolution fails (no lat/lon or IATA code).
  - Flights require both origin and destination IATA codes; otherwise calls are skipped.
  - Redis is optional — `initRedis()` is called at startup but the app gracefully falls back when Redis or Amadeus keys are missing.

## Debugging and dev workflow examples

- Quick local run (all services): `./run.sh` (root) starts the full compose stack including Redis and Open WebUI.
- API only: from `packages/api/` run `npm install && npm run build && npm start`.
- Genkit Dev UI (visualize flows): `cd packages/api && npm run genkit:dev` then open `http://localhost:4100`.
- Open WebUI: run the management script `./open-webui.sh start` or use a Docker run with the `v1` OpenAI-compatible backend pointed to `http://host.docker.internal:4000/v1`.

## Where to look for examples

- `packages/api/src/utils/intent-router-v2.ts` — canonical query routing & intent analysis example
- `packages/api/src/genkit/agents/sub-agents/master-agent.ts` — shows how sub-agents are invoked in parallel and combined
- `packages/api/src/genkit/agents/sub-agents/*.ts` — actual sub-agent implementations (flights/hotels/activities/etc.)
- `packages/api/src/genkit/agents/formatters/response-formatter.ts` — canonical formatter; any change here affects UI and streaming text
- `packages/api/src/utils/cache.ts` and `CACHING.md` — caching architecture and TTLs

If anything here doesn't match your local branch or a different orchestrator (LangChain/LlamaIndex), say which orchestrator you'd like me to add guidance for and I'll update the instructions.

## Genkit quick reference for this repo (flows, tools, MCP, RAG, agents)

Below is a practical, project-scoped cheat sheet distilled from the latest Genkit docs to help you implement and extend the API in `packages/api/` fast. Each topic links conceptually to where it applies in this codebase.

### Creating flows

- Define flows with `ai.defineFlow({ name, inputSchema, outputSchema }, handler)`; use Zod schemas for both input and output.
- In this repo, flows map to “sub-agents” in `packages/api/src/genkit/agents/sub-agents/*.ts` and the orchestrator in `master-agent.ts`.
- Flows support streaming via `.stream()` and side-channel callbacks; prefer non-streamed outputs for SSE formatting consistency unless you wire through the UI formatter in `formatters/response-formatter.ts`.
- Keep inputs stable and future-proof: wrap them in `z.object({ ... })` so you can evolve parameters without breaking callers.

### Generating content

- Use `ai.generate({ model, prompt|messages, output?, config? })`.
- Default model/provider is configured in `packages/api/src/genkit/ai.ts` (Gemini via `@genkit-ai/google-genai` by default). Override per-call when needed.
- Prefer structured output with Zod schemas: `output: { schema: MySchema }` then read `response.output` (nullable on failure). Add minimal coercion (e.g., `z.coerce.number()`) to steady outputs.
- For low latency, consider `ai.generateStream()` and accumulate chunks; only adopt if `response-formatter.ts` and UI streaming are updated accordingly.

### Tool calling

- Define tools with `ai.defineTool({ name, description, inputSchema, outputSchema }, impl)` and pass them via `tools: [myTool]` in `ai.generate()` or prompts.
- Use `maxTurns` to cap iterative tool loops; for full control set `returnToolRequests: true` and implement the loop yourself.
- Integrate external tools via MCP (see “Model Context Protocol (MCP)” below) so you can combine local tools and remote MCP tools in one call.

### Implementing Agentic Patterns

- This repo already uses agentic orchestration:
  - Conditional routing: `utils/intent-router-v2.ts` selects single-category flows or escalates to `master-agent`.
  - Parallel execution: `master-agent.ts` runs flights/hotels/activities concurrently when possible.
  - Iterative refinement: implement as a small loop inside a flow; return partials on failure (respect the formatter contract).
- Keep state handling and side effects isolated inside flows; wrap non-Genkit steps in `ai.run('step-name', fn)` so they appear in traces.

### Managing prompts with Dotprompt

- Optional but valuable for iteration. Recommended setup:
  - Create `packages/api/prompts/` and set `promptDir` in `genkit/ai.ts`.
  - Author `.prompt` files with front matter (model, tools, schemas) and Handlebars templates.
  - Load with `const p = ai.prompt('name')` or define in code via `ai.definePrompt(...)`.
- Use prompt variants (`my_prompt.variant.prompt`) to A/B test wording and model settings; variants show up in traces.

### Passing information through context

- Pass a `context` object when calling flows/generation. Standard shape for auth:
  - `{ auth: { uid, token, rawToken } }`
- Context is propagated automatically to nested flows, tools, and prompts; override selectively with `{ context: { ...context, extra } }`.
- Use context to scope tool access (e.g., user-specific data fetch) without leaking IDs into the prompt.

### Pause generation using interrupts

- Use `ai.defineInterrupt({ name, inputSchema, outputSchema })` for human‑in‑the‑loop (HITL) or approvals.
- Pattern: call `ai.generate({ tools: [askUserOrApprove], ... })`; if `response.interrupts.length > 0`, gather UI input and resume with `resume.respond` (or `resume.restart` for restartable tools that inspect `resumed`).
- Good fit here for risky actions (e.g., booking confirmations, payment approvals) before calling suppliers.

### Creating persistent chat sessions

- For chat UX or multi-turn planning, use `ai.chat()` (simple) or `ai.createSession({ initialState, store })` (stateful + persistent).
- Multiple threads per session are supported (`session.chat('threadId')`).
- Not required for the current HTTP API, but useful if you add a conversational endpoint in `packages/api/src/index.ts`.

### Model Context Protocol (MCP)

- Already enabled in this repo via Genkit CLI:
  - Dev task: run “Run Genkit MCP Server” (workspace task) or `npm run genkit:mcp:dev` in `packages/api/`.
  - Workspace MCP config: `.vscode/mcp.json` registers `genkit` (stdio) and several HTTP/SSE tools.
- As a client: pull external tools/resources with `@genkit-ai/mcp` host/client and pass them to `ai.generate({ tools, resources })`.
- As a server: your defined tools/prompts are exposed automatically when the Genkit MCP server runs.

### Retrieval‑augmented generation (RAG)

- Use Genkit retrievers/indexers/rerankers to add domain context:
  - Quick local dev: `@genkit-ai/dev-local-vectorstore` with a Gemini embedder.
  - Production: pick a plugin (Pinecone, Vertex AI Vector Search, Chroma, etc.).
- Typical pattern in a flow:
  1) retrieve with `ai.retrieve({ retriever, query, options })`
  2) pass `docs` to `ai.generate({ prompt, docs })`
  3) optionally rerank with `ai.rerank(...)`.
- Tie into caching via `withCache()` when retrieval depends on repeatable queries (see `utils/cache.ts`).

### Building multi‑agent systems

- The current design is already multi-agent: `master-agent` triages and invokes specialized sub-agents (flights/hotels/activities).
- For prompt‑as‑agent: define prompts with their own tool sets and expose them as tools to a top-level “triage” prompt/flow.
- Keep each agent’s input/output typed and validated; the top-level formatter merges outputs for UI consistency.

### Error types

- Prefer throwing `UserFacingError` for expected user/input issues; let unexpected errors bubble as internal errors captured by hosting plugins.
- Flows should return partials on unknown errors (this repo already returns origin/destination/dates at minimum from `master-agent`).

### Evaluation

- Use the Genkit Dev UI Datasets + Evaluations to score flows (faithfulness, answer relevancy, maliciousness, etc.).
- CLI options: `genkit eval:flow <flow> --input <dataset.json>` or `eval:run` for raw evaluation datasets; batching supported.
- For this repo, evaluations complement existing latency/cost benchmarks in `packages/api/src/scripts/`.

### Local observability and metrics

- Start Dev UI with Genkit to inspect traces and steps (`ai.run`, `generate`, `retrieve`, etc.).
- This repo also logs lightweight metrics with `METRIC:` prefixes and cache hit/miss statistics; see `Genkit Dev UI` + local `local-reports/` for combined analysis.
- You can export OpenTelemetry data to your stack or use Firebase Genkit Monitoring in production.

Notes and alignment to repo contracts

- Respect formatter contracts in `formatters/response-formatter.ts` whenever you change a flow’s output; otherwise the UI and SSE streams can break.
- Use `withCache()` + `getCacheKey()` (`utils/cache.ts`) for any call that repeats (Amadeus, geocode, RAG retrievers) to reduce latency and token costs.
- Keep flows small and testable; wrap external calls with `ai.run('step-name', ...)` so they show in traces and can be benchmarked.

## Genkit knowledge base (developer cheat-sheet)

This knowledge base condenses core Genkit guidance from the official docs into short help for adding features, troubleshooting, and debugging in this repository.

### Concepts & where to look
- Flows: `ai.defineFlow()` — code lives in `packages/api/src/genkit/agents/sub-agents/`.
- Models: `ai.generate()` / `ai.generateStream()` — configured in `packages/api/src/genkit/ai.ts`.
- Tools & tool-calling: `ai.defineTool()` — used throughout `packages/api` and exposed via MCP.
- Prompts/Dotprompt: `.prompt` files — suggested `packages/api/prompts/` with `promptDir` in `genkit/ai.ts`.
- MCP: `.vscode/mcp.json` and `packages/api` scripts (see `genkit:mcp`); use inspector for testing MCP servers.
- RAG: indexers, embedders, retrievers — use `@genkit-ai/dev-local-vectorstore` for dev; see `packages/api/src/genkit/agents/*` for flows that call `ai.retrieve()`.

### Best practices and patterns
- Type-safety: Always use Zod input/output schemas for flows and tools. Prefer objects (`z.object({...})`) so the Dev UI shows labeled fields.
- Streaming: Use streaming flows only where the UI or SSE expects it; `sendChunk()` helps forward generator stream chunks.
- Tool limits: Set `maxTurns` to avoid runaway tool-calling loops. For critical tools, prefer `returnToolRequests: true` and implement explicit handling.
- Caching: Use `withCache()` + `getCacheKey()` in `packages/api/src/utils/cache.ts` for expensive ops (Amadeus, Geocode, retriever calls).
- Reusability: Register common retrievers, indexers, and rerankers as referenced services in `packages/api/src/genkit/`.

### Common errors & troubleshooting recipes
- Schema mismatch (structured output returns null):
  - Symptoms: `response.output` is `null` or flow raises "Response doesn't satisfy schema".
  - Quick fixes: lower schema strictness with `z.coerce.*`, use a more powerful model (Gemini/Claude), or retry generation with small changes. Verify the model supports JSON output.
  - Debug: run the Genkit Dev UI `genkit start -- tsx --watch src/index.ts` and inspect trace for the `generate()` call -> see raw text fragments.

- Tool calling not supported by model:
  - Symptoms: Genkit throws error when `tools` provided.
  - Fix: `ai.generate()` expects only models that support tool calls; check plugin `info.supports.tools` or switch to a model that supports it.

- Interrupts not handled / resume fails:
  - Symptoms: `response.interrupts` present, but `resume` call doesn't progress.
  - Fix: Construct resume via `theTool.respond(interrupt, result)` or `theTool.restart(interrupt, meta)` and call `ai.generate({ messages: response.messages, resume: { respond|restart } })`. Inspect Dev UI to see the interrupt step and metadata.

- MCP server connection errors (spawn ENOENT/timeout):
  - Symptoms: IDE shows spawn `genkit ENOENT` or MCP connection fails.
  - Fix: Ensure `.vscode/mcp.json` points to the local `node_modules/.bin/genkit` if Genkit is installed locally; use full path in `command` to avoid PATH differences. Example: `${workspaceFolder}/packages/api/node_modules/.bin/genkit`.
  - Test: use `npx @modelcontextprotocol/inspector dist/index.js` to debug MCP servers and confirm available tools/prompts.

- `generate()` slow or times out:
  - Symptoms: calls to LLMs take long or time out.
  - Fix: try a cheaper model for classification or a caching layer for repeated queries; set `config.maxOutputTokens` and `temperature` appropriately; use `generateStream()` only when necessary.

### Developer quick commands (repo-specific)
- Start API and dev stack (root):
```bash
./run.sh
```
- Start API dev & Genkit Dev UI (in `packages/api`):
```bash
cd packages/api
npm run genkit:dev
# opens http://localhost:4100
```
- Run a flow locally via CLI:
```bash
cd packages/api
genkit flow:run <flow-name> '{"inputKey":"value"}'
```
- Run an evaluation:
```bash
cd packages/api
genkit eval:flow <flowName> --input <dataset.json>
```
- Start Genkit MCP server (stdio) for this repo:
```bash
cd packages/api
npm run genkit:mcp:dev
```

### Debugging checklist
1. Reproduce: run flow in Genkit Dev UI (fastest way to inspect traces)
2. Check logs: `METRIC:` lines and trace steps in `local-reports/` and `packages/api/src/genkit/*`
3. Validate schemas: check Zod input/output for optional/nullable fields
4. Model: try `gemini-2.5-flash` vs `gemini-2.5-pro` or switch to different provider plugin if tool calling is needed
5. Network/auth: ensure `REDIS_URL`, API keys or service credentials are present; `GET /api/health` shows configured components
6. MCP tools: confirm `.vscode/mcp.json` entries and use inspector to validate tool list

### Where to add project-level examples
- Example flows and RAG: add indexers in `packages/api/src/genkit/agents/*` and wire local vector store in `packages/api/src/genkit/ai.ts`.
- Example prompts: place `.prompt` files in `packages/api/prompts/` and load via `ai.prompt('name')`.
- Unit tests: add minimal tests for flows and tools in `packages/api/src/genkit/tests/` to assert happy-path and schema validation.

If you'd like I can add a small RAG demonstration and flow tests in `packages/api/src/genkit/tests/` (low-risk), or create a standard troubleshooting script to exercise flows and tools automatically.