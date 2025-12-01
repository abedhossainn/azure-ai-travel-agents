# Rate Limiter Implementation

## Overview

This implementation handles Google Gemini API 429 (rate limit) errors gracefully by:

1. **Server-side**: Catching 429 errors and returning a user-friendly message
2. **Client-side**: Providing request queuing to prevent rapid successive requests

## Files Modified

### 1. `packages/api/src/genkit/ai.ts`
- Reduced max retries from 3 to 2 (3-5 second max wait)
- Enhanced error handling to mark 429 errors with `code: 429` and `isRateLimit: true`
- Throws descriptive error message explaining the quota limit

**Changes:**
```typescript
- maxRetries: 3 → maxRetries: 2
- baseDelay: 1000 → baseDelay: 800
- Error now includes user-friendly guidance on rate limits
```

### 2. `packages/api/src/utils/intent-router-v2.ts`
- Added `formatRateLimitResponse()` helper function
- Wrapped `routeQuery()` to catch 429 errors
- Returns formatted markdown message when rate limit is hit
- Internal logic moved to `_routeQueryInternal()`

**New behavior:**
- 429 errors are caught at routing level
- Returns helpful message with wait time guidance
- User immediately sees error, not stuck waiting

### 3. `packages/api/src/index.ts`
- Imported rate limiter utility
- Added `/api/rate-limiter.js` endpoint (serves client-side script)

### 4. `packages/api/src/utils/request-rate-limiter.ts` (NEW)
- `RequestRateLimiter` class for TypeScript/Node.js usage
- `injectClientRateLimiter()` for browser-side injection
- Prevents rapid successive requests (default 3 second minimum spacing)

## Usage

### Server-Side (Automatic)
The error handling is automatic. When a 429 error occurs:

1. API retries up to 2 times with exponential backoff
2. If still failing after retries, throws error with code 429
3. Intent router catches the error and returns formatted response
4. User sees helpful message instead of generic error

### Client-Side

#### Option 1: TypeScript/Node.js
```typescript
import { RequestRateLimiter } from './utils/request-rate-limiter';

const limiter = new RequestRateLimiter({ minDelayMs: 3000 });

// Protect a request
const response = await limiter.execute(() => 
  fetch('/api/v2/chat', { method: 'POST', body: JSON.stringify({ message: 'Paris trip' }) })
);

// Check status
const status = limiter.getStatus();
console.log(`Queued: ${status.queued}, Ready: ${status.isReady}`);
```

#### Option 2: Browser (Inject Script)
```html
<!-- In Open WebUI or any client -->
<script src="http://localhost:4000/api/rate-limiter.js"></script>

<script>
// After page load, the limiter is available as:
window._travelAgentRateLimiter.execute(async () => {
  return fetch('/api/v2/chat', { /* ... */ });
});

// Check status
const status = window._travelAgentRateLimiter.getStatus();
</script>
```

## Rate Limit Information

### Google Gemini Free Tier
- **Requests Per Minute**: 30 RPM
- **Tokens Per Minute**: 200,000 TPM
- **Per Query**: ~8-10 LLM calls (parallel sub-agents)

### Safe Request Spacing
- **Recommended**: 3-5 seconds between queries
- **Conservative**: 10+ seconds between queries
- **Default limiter**: 3 seconds minimum delay

### Quota Reset
- **Per-minute limits**: Apply continuously
- **Daily limits**: Reset at midnight Pacific time (UTC-8)

## Error Response Format

When a 429 error occurs, users see:

```markdown
# ⚠️ API Quota Limit Reached

Your request exceeded the Google Gemini API rate limit (30 requests per minute).

## What to do:
- **Wait 30-60 seconds** before submitting another query
- The quota resets at **midnight Pacific time (UTC-8)**
- For faster testing, consider upgrading your Google Cloud API to a **paid tier**

## Rate Limit Info:
- **Free tier**: 30 requests per minute
- **Per query**: ~8-10 LLM calls (parallel sub-agents)
- **Safe spacing**: 3-5 seconds between queries recommended

[Learn more about rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
```

## Monitoring

### Server Logs
Look for these patterns:
- `[RATE_LIMIT] Max retries exceeded for 429 error` - Rate limit hit
- `[RETRY] 429 error, retrying in XXXms` - Retry attempt
- `[RATE_LIMIT] Returning user-friendly rate limit message` - User getting error response

### Client-Side
- Browser console shows rate limiter activity
- `window._travelAgentRateLimiter.getStatus()` returns queue info

## Testing

### Trigger a 429 Error Locally
```bash
# Rapid requests to trigger rate limit
for i in {1..35}; do
  curl -X POST http://localhost:4000/api/v2/chat \
    -H "Content-Type: application/json" \
    -d '{"message":"Paris trip"}' &
done
wait
```

### Check Limiter Status
```javascript
// In browser console
window._travelAgentRateLimiter.getStatus()
// Output: { minDelay: 3000, lastRequestTime: 1701432000123, timeSinceLastRequest: 250 }
```

## Future Improvements

1. **Adaptive Rate Limiting**: Automatically increase delays if 429s are frequent
2. **User Notifications**: Toast/banner in UI when rate limit is hit
3. **Retry Dialog**: "Retry in 30 seconds" button for users
4. **Analytics**: Track 429 frequency per API key
5. **Circuit Breaker**: Temporarily disable requests if quota is consistently exceeded
