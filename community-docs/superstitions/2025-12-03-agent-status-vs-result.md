---
topic: agents, reactivity, error-handling
discovered: 2025-12-03
confirmed_count: 1
last_confirmed: 2025-12-03
sessions: [hotel-membership-extractor-auth-error-ui]
related_labs_docs: none
status: superstition
stars: ⭐
---

# ⚠️ SUPERSTITION - UNVERIFIED

**This is a SUPERSTITION** - based on a single observation. It may be:
- Incomplete or context-specific
- Misunderstood or coincidental
- Already contradicted by official docs
- Wrong in subtle ways

**DO NOT trust this blindly.** Verify against:
1. Official labs/docs/ first
2. Working examples in labs/packages/patterns/
3. Your own testing

**If this works for you,** update the metadata and consider promoting to folk_wisdom.

---

# Agent Tool Call Status Updates Get Overwritten - Derive Error State from Result

## Problem

When using `useAgent()` with tools, you might try to track error states by updating a cell during tool execution:

```tsx
// In tool definition:
const searchGmail = defineTool({
  // ...
  execute: async (params, { searchProgress }) => {
    try {
      const result = await fetchGmail(params);
      return result;
    } catch (e) {
      if (e.message.includes("401")) {
        // Try to signal auth error to UI
        searchProgress.set({ status: "auth_error", authError: e.message });
      }
      throw e;
    }
  }
});

// In UI:
{computed(() =>
  searchProgress.status === "auth_error" ? <AuthErrorUI /> : null
)}
```

**Result:** The auth error UI never appears, even though the 401 error occurred.

## Why This Happens

Agents **batch tool calls**. When processing a task, the agent may:
1. Call tool A (sets status to "auth_error")
2. Immediately call tool B (overwrites status to "searching")
3. Call tool C (overwrites status again)
4. Finally return result

By the time the agent finishes and the UI re-renders, the intermediate "auth_error" status has been overwritten by subsequent tool calls.

## Solution

**Derive error state from the agent's final result**, which persists after completion:

```tsx
const { pending: agentPending, result: agentResult } = useAgent<AgentResult>({
  // agent config...
});

// Derive error state from agent result summary (reactive approach)
const hasAuthError = computed(() => {
  const summary = agentResult?.summary || "";
  return summary.includes("401") || summary.toLowerCase().includes("authentication error");
});

// UI reacts to persistent state
{ifElse(hasAuthError, <AuthErrorUI />, null)}
```

**Why this works:**
- The agent's final result persists after scan completes
- The summary typically contains error information
- Deriving from persistent data is the reactive approach (vs event-based status tracking)

## Pattern

```
Event-based (fragile):     Tool call → Set status → Status overwritten → Lost
Reactive (robust):         Tool call → Agent result → Derive from result → Persists
```

## Alternative Approaches

If you need real-time status during agent execution:

1. **Use the agent's built-in pending state** for loading indicators
2. **Accumulate errors in an array** instead of overwriting status
3. **Return error info in the agent's final result schema**

## Context

Discovered while implementing Gmail 401 error handling in hotel-membership-extractor. Initial approach tracked `searchProgress.status = "auth_error"` in the Gmail search tool. The UI never showed the error because the agent made 5 batched search calls and only the last status value was visible.

Switched to deriving `hasAuthError` from `agentResult.summary` which contains "authentication error" text. This persists after the scan completes and the UI renders correctly.

## Related

- **Folk Wisdom: Thinking Reactively vs Events** - General principle of deriving state from data
- **Folk Wisdom: onClick Handlers in Conditional Rendering** - Related ifElse() usage

---

**Remember:** This is a SUPERSTITION. Verify before relying on it.
