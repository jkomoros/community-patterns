# generateObject with derive() on Agent Output Causes Infinite Loops

**Date**: 2025-12-08
**Status**: superstition
**Confidence**: high
**Observed by**: jkomoros (alex)

## Problem

When using `generateObject` with an agentic pattern, if the `agentGoal` (or any input that affects the prompt) is derived from cells that the agent writes to, it causes an infinite loop:

1. Agent runs and writes results (e.g., `memberships.push(...)`)
2. `agentGoal` derives from those results (e.g., "Already found: X, Y, Z")
3. Goal changes → prompt changes → `generateObject` restarts
4. Agent runs again → writes more results → REPEAT

This manifests as the server getting stuck at 100%+ CPU with no output.

## The Bad Pattern

```tsx
// DON'T DO THIS - causes infinite loop!
const memberships = Cell.of<MembershipRecord[]>([]);

const agentGoal = computed(() => {
  const found = memberships;
  const max = maxSearches;
  const foundBrands = found.map(m => m.brand);
  return `Find memberships. Already saved: ${foundBrands.join(", ")}`;
});

// This will infinite loop because:
// agent writes to memberships → agentGoal changes → prompt changes → agent restarts
const agent = generateObject({
  prompt: computed(() => agentGoal),  // Changes when memberships change!
  tools: { reportMembership: { handler: (args) => memberships.push(args) } },
  ...
});
```

## The Good Pattern

```tsx
// DO THIS INSTEAD - goal is static, doesn't depend on agent output
const memberships = Cell.of<MembershipRecord[]>([]);

const agentGoal = computed(() => {
  const max = maxSearches;
  const mode = scanMode;
  return `Find hotel loyalty memberships. Search up to ${max} times.`;
});

// Agent can still write to memberships, but agentGoal won't change
const agent = generateObject({
  prompt: computed(() => agentGoal),  // Stable prompt
  tools: { reportMembership: { handler: (args) => memberships.push(args) } },
  ...
});
```

## Key Insight

The `generateObject` prompt should be **stable** during agent execution. If any cell in the derive chain that builds the prompt can be modified by the agent's tools, you'll get an infinite loop.

## What to Derive From (Safe)

- Configuration/settings (maxSearches, scanMode)
- Static inputs passed from parent patterns
- User-set preferences that don't change during scan

## What NOT to Derive From (Dangerous)

- Arrays/cells the agent writes to
- State derived from agent output (found items, progress counts)
- Anything that changes as a result of tool calls

## Debugging Tips

If your server gets stuck at 100% CPU:
1. Check if any `computed()` building the agent prompt depends on cells the agent writes to
2. Look for any "feedback loops" where output affects input
3. The pattern might work initially but loop when the agent succeeds at its task

## Related

- `2025-12-06-computed-set-causes-cpu-loop.md` - Similar loop issue with computed
- `2025-12-06-wish-inside-derive-causes-infinite-loop.md` - Wish loops
