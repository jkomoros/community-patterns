# Reactive Thinking - The Core Framework Principle

**Blessed by:** Framework author (verbal guidance, December 2024)
**Status:** FOUNDATIONAL - Read this BEFORE other community docs!

---

## The Framework Mental Model

CommonTools is a **reactive computation graph framework**. It is NOT:
- An event-driven framework (like traditional JavaScript)
- A request-response framework (like REST APIs)
- A callback-based framework (like Node.js)

Your pattern describes **what data relationships exist**, and the framework handles **when computations run**.

Think of it like a spreadsheet: you define formulas (derives/computeds), and when source cells change, dependent cells automatically update. You don't write "when A changes, then update B" - you write "B = f(A)" and the spreadsheet handles the rest.

---

## The Golden Rules

### 1. Describe Relationships, Not Sequences

**Imperative (wrong):** "When X happens, then do Y, then do Z"
**Reactive (correct):** "Z depends on Y, which depends on X"

```typescript
// WRONG - Imperative sequence
onClick={() => {
  fetchData();
  processData();
  updateUI();
}}

// CORRECT - Reactive relationships
const data = fetchData({ url });           // Fetches when url changes
const processed = derive(data, transform);  // Transforms when data changes
// UI automatically re-renders when processed changes
```

### 2. React to Data, Not Events

Don't think "what happens when the user clicks?" Think "what is the current state, and what should the UI show for that state?"

```typescript
// WRONG - Event-driven state management
const onRefreshClick = handler(() => {
  isRefreshing.set(true);
  doRefresh();
  isRefreshing.set(false);
});

// CORRECT - Reactive state derivation
const isRefreshing = derive(refreshOperation, (op) => op.loading);
// UI shows spinner when isRefreshing is true - no manual tracking
```

### 3. Let the Framework Manage Timing

The framework knows when to run computations, when to cache, and when to re-execute. Trust it.

```typescript
// WRONG - Manual timing
setTimeout(() => cell.set(value), 1000);
setInterval(() => poll(), 5000);

// CORRECT - Let reactive primitives handle it
const data = fetchData({ url });  // Framework manages refetching
const result = generateObject({ prompt });  // Framework manages execution
```

---

## Anti-Patterns: What NOT to Do

### 1. Never Use `onCommit` Callbacks

`onCommit` is an **INTERNAL RUNTIME FEATURE** - it is NOT intended for use in patterns.

```typescript
// WRONG - onCommit is internal API, causes ConflictError in cross-charm scenarios
stream.send({}, (tx) => {
  if (tx?.status?.() === "done") {
    // coordinate after commit
  }
});

// CORRECT - Fire and forget, let reactive gating handle retry
stream.send({});
// The target charm updates its cells
// Your derives automatically re-run when those cells change
```

**Why this is wrong:**
- Violates the reactive model (creates imperative coordination)
- Causes ConflictError in cross-charm scenarios (wrong transaction context)
- May break in future framework versions (it's internal API)

### 2. Never Use `await` in Handlers

Handlers are **synchronous state transitions**. Async operations belong in reactive primitives like `fetchData` and `generateObject`.

```typescript
// WRONG - Async handler blocks UI, violates reactive model
const handleClick = handler(async (_, state) => {
  const data = await fetch(url);
  state.result.set(data);
});

// CORRECT - Handler triggers state change, fetchData handles async
const { result, loading } = fetchData({ url: urlCell });

const handleClick = handler((_, { urlCell }) => {
  urlCell.set(newUrl);  // This triggers reactive refetch
});
```

**See also:** `blessed/handlers.md` - "Never Use await in Handlers"

### 3. Never Use `setTimeout` or `setInterval`

Manual timing breaks the computation graph. The framework can't track these dependencies.

```typescript
// WRONG - Framework can't reason about timing
setTimeout(() => cell.set(newValue), 1000);
setInterval(() => refreshData(), 60000);

// CORRECT - Use reactive primitives
// For delayed effects: model as state machine
const timer = cell<"waiting" | "ready">("waiting");
// For polling: use bgUpdater or framework refresh mechanisms
```

### 4. Never Use Callbacks for State Coordination

If you're thinking "do X, then Y, then Z", you're thinking imperatively.

```typescript
// WRONG - Callback chain
doThing(() => {
  doNextThing(() => {
    updateState();
  });
});

// CORRECT - Reactive dependencies
const step1 = derive(input, computeStep1);
const step2 = derive(step1, computeStep2);
const result = derive(step2, computeResult);
// Framework manages execution order automatically
```

---

## Common "I Need a Callback" Scenarios

### "I need to wait for something to complete"

**Reactive solution:** Derive from completion state.

```typescript
// WRONG
operation.onComplete(() => nextStep());

// CORRECT
const { result, loading, error } = fetchData({ url });
// loading is reactive - UI updates automatically
// result populates when complete - derived values update automatically
```

### "I need to coordinate between charms"

**Reactive solution:** Gate your UI/agent on the wished charm's state.

```typescript
// WRONG - Imperative coordination with callback
wishedCharm.refreshStream.send({}, (tx) => {
  // wait for commit then continue
});

// CORRECT - Reactive gating
const auth = derive(wishedCharm, (charm) => charm?.result?.auth);
const tokenValid = derive(auth, (a) => a?.expiresAt && Date.now() < a.expiresAt);

// Gate agent prompt on token validity
const agentPrompt = derive(
  [isRunning, prompt, tokenValid],
  ([running, p, valid]) => {
    if (!running || !valid) return "";  // Agent pauses when token invalid
    return p;  // Agent runs when token is valid
  }
);

// When token refreshes, auth updates, tokenValid becomes true,
// agentPrompt becomes non-empty, agent automatically resumes!
```

### "I need to trigger a refresh after an error"

**Reactive solution:** Fire-and-forget the refresh, let reactive gating handle retry.

```typescript
// WRONG - Wait for refresh to complete
await new Promise((resolve) => {
  refreshStream.send({}, () => resolve());
});
await retryOperation();

// CORRECT - Fire-and-forget + reactive gating
refreshStream.send({});  // Triggers refresh in auth charm
// Return error - agent will auto-retry when auth becomes valid
// because the gating conditions will become true again
return { error: true, message: "Token refresh triggered" };
```

### "I need to run something periodically"

**Reactive solution:** Use `bgUpdater` handler, not `setInterval`.

```typescript
// WRONG - Manual interval
setInterval(() => syncData(), 60000);

// CORRECT - bgUpdater runs periodically in background service
const syncHandler = handler((_event, { data }) => {
  // This runs ~every 60s via bgUpdater
  const fresh = fetchLatestData();
  data.set(fresh);
});

// Export as bgUpdater
export default pattern(() => ({
  bgUpdater: syncHandler({ data }),
}));
```

---

## The Reactive Pattern for Token Refresh

A complete example showing the reactive approach:

```typescript
// 1. Derive auth state from wished charm
const authCharm = wish<AuthCharm>({ query: "#googleAuth" });
const auth = derive(authCharm, (c) => c?.result?.auth);
const refreshStream = derive(authCharm, (c) => c?.result?.refreshToken);

// 2. Derive validity conditions
const isAuthenticated = derive(auth, (a) => !!(a?.token && a?.user));
const tokenExpired = derive(auth, (a) => {
  if (!a?.expiresAt) return false;
  return Date.now() > (a.expiresAt - 5 * 60 * 1000);  // 5 min buffer
});
const hasRequiredScope = derive(auth, (a) => a?.scope?.includes(REQUIRED_SCOPE));

// 3. Gate agent prompt on ALL conditions
const agentPrompt = derive(
  [isRunning, prompt, isAuthenticated, tokenExpired, hasRequiredScope],
  ([running, p, authed, expired, hasScope]) => {
    if (!running) return "";
    if (!authed) return "";      // Not logged in
    if (expired) return "";      // Token expired - pause
    if (!hasScope) return "";    // Missing scope
    return p;                    // All good - run agent
  }
);

// 4. In tool handler, if API returns 401:
if (response.status === 401 && refreshStream?.send) {
  refreshStream.send({});  // Fire-and-forget
  return { error: true, message: "Token refresh triggered" };
}

// 5. The reactive magic:
// - refreshStream.send() triggers refresh in auth charm
// - auth charm updates its auth cell
// - Our derived auth updates
// - tokenExpired becomes false
// - agentPrompt becomes non-empty
// - Agent automatically retries!
```

---

## Summary

| Instead of... | Use... |
|--------------|--------|
| `onCommit` callbacks | Fire-and-forget + reactive gating |
| `await` in handlers | `fetchData`, `generateObject` primitives |
| `setTimeout`/`setInterval` | Reactive primitives, `bgUpdater` |
| Callback chains | Dependency chains with `derive` |
| Event-driven state | Derived state from source cells |

**The reactive mindset:** Your code describes the shape of data relationships. The framework handles execution timing, caching, and coordination.

---

## Related Documents

- `blessed/handlers.md` - Handler rules (no await, define outside pattern)
- `blessed/reactivity.md` - Idempotent side effects in computed/derive
- `folk_wisdom/thinking-reactively-vs-events.md` - Practical reactive examples
- `folk_wisdom/reactivity.md` - Pattern/computed/derive/handler mental model
