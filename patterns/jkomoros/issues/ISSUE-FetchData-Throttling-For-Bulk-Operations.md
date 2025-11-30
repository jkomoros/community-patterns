# Issue: fetchData Needs Throttling for Bulk Operations

## Summary

When a pattern maps over many items (30+) with `fetchData` calls, all requests fire simultaneously, overwhelming the `/api/agent-tools/web-read` endpoint and causing widespread failures. Patterns cannot implement throttling themselves because userland timing is (correctly) disallowed for security reasons.

## Observed Behavior

**Context:** Testing `prompt-injection-tracker-v3` with real Gmail data (33 emails → 66 extracted URLs)

**What happened:**
1. L1 extraction completed successfully (33/33)
2. L2 web fetching triggered ~60+ concurrent `fetchData` calls to `/api/agent-tools/web-read`
3. Server became overwhelmed - socket errors, connection refused
4. Most requests failed with 422 errors or timeouts
5. L2 showed 0/31 success, ⚠️30 errors
6. Server crashed with "Socket is in unknown state" error
7. After restart, requests slowly recovered as the system retried

**Console evidence:**
- Hundreds of storage transaction failures (concurrent write contention)
- Server crash requiring `restart-local-dev.sh --force`
- Gradual recovery as requests completed one by one

## Why Patterns Can't Fix This

Reactive patterns correctly cannot access timing primitives (`setTimeout`, `setInterval`) for security reasons. This means patterns cannot:

- Implement their own rate limiting
- Add delays between requests
- Batch requests manually with timing
- Implement exponential backoff

Throttling must be implemented in trusted framework components.

## Sketch of Solutions

### Option 1: Concurrency Limit in `fetchData` Primitive

Add a global or per-call concurrency limit to `fetchData`:

```typescript
// Global limit (framework config)
// "Only allow N concurrent fetchData calls across all patterns"

// Or per-call option
const webContent = fetchData({
  url: "/api/agent-tools/web-read",
  options: { method: "POST", body: webContentBody },
  // New option - framework queues requests exceeding limit
  maxConcurrent: 5,
});
```

**Pros:** Pattern authors can tune for their use case
**Cons:** Requires pattern changes, easy to forget

### Option 2: Server-Side Rate Limiting on web-read Endpoint

The `/api/agent-tools/web-read` endpoint implements a request queue:

- Accept all requests immediately (return pending)
- Process N requests concurrently (e.g., 5-10)
- Queue the rest, process as slots free up
- Return results as they complete

**Pros:** Zero pattern changes, transparent to reactive system
**Cons:** Endpoint-specific, doesn't help other fetchData targets

### Option 3: Global fetchData Queue in Framework

Framework maintains a global queue for all `fetchData` calls:

- Configurable concurrency limit (default: 10?)
- FIFO or priority-based processing
- Automatic retry with backoff on 429/5xx errors

**Pros:** Works for all fetchData targets, no pattern changes
**Cons:** May need per-endpoint tuning

### Option 4: New `batchMap` Primitive

Introduce a primitive specifically for bulk operations:

```typescript
// Instead of: items.map(item => fetchData(...))
const results = batchMap(items, (item) => fetchData({
  url: "/api/agent-tools/web-read",
  body: { url: item.url },
}), {
  batchSize: 5,      // Process 5 at a time
  retryOnError: true // Auto-retry failures
});
```

**Pros:** Explicit intent, pattern author controls batch size
**Cons:** New primitive to learn, migration needed

## Recommendation

**Option 2 + Option 3 combined:**

1. **Server-side:** `/api/agent-tools/web-read` should have built-in rate limiting since it's making external HTTP requests that can fail/timeout
2. **Framework-side:** Global `fetchData` concurrency limit as a safety net for any endpoint

This gives defense in depth without requiring pattern changes.

## Additional Observations

- The framework's retry mechanism does eventually recover - requests succeeded after the initial flood subsided
- Storage transaction failures are handled gracefully (framework retries)
- The pattern architecture (map over items → fetchData) is correct; it's the execution that needs throttling

## Related

- Pattern: `patterns/jkomoros/prompt-injection-tracker-v3.tsx`
- Session: Testing with Gmail auth, Nov 29, 2025
- Server crash log: "Socket is in unknown state" in toolshed

## Metadata

```yaml
type: feature-request
priority: medium
affects: fetchData, web-read endpoint, bulk operations
discovered: 2025-11-29
```
