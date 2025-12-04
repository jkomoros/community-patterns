---
topic: llm
discovered: 2025-12-04
confirmed_count: 1
last_confirmed: 2025-12-04
sessions: [handler-refactor-createReportTool]
related_labs_docs: ~/Code/labs/docs/common/LLM.md
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

# Tool Handlers Must Use Schema-Based Signatures, Not Function Configs

## Problem

Factory patterns that take **functions** as configuration won't work with future framework sandboxing. Functions cannot be serialized and passed across sandbox boundaries.

**Problematic pattern:**
```typescript
// ❌ WON'T WORK with sandboxing
function createReportTool<T>(config: {
  dedupeKey: (input: T) => string,    // Function as config
  toRecord: (input: T) => Record,     // Function as config
}) {
  return handler<T, { records: Cell<Record[]> }>(
    (input, { records }) => {
      const key = config.dedupeKey(input);  // Closure over function
      const record = config.toRecord(input);
      // ...
    }
  );
}
```

The problem: `createReportTool` takes functions (`dedupeKey`, `toRecord`) and creates handlers that close over them. Once sandboxing is enabled, these closures will fail.

## Solution: Inline Logic, Schema-Based State

The proper pattern uses schemas as DATA (serializable) and puts logic INLINE in the callback:

```typescript
// ✅ SANDBOX-SAFE pattern
const reportHandler = handler(
  // INPUT SCHEMA - what LLM sends (data, not functions!)
  {
    type: "object",
    properties: {
      hotelBrand: { type: "string" },
      membershipNumber: { type: "string" },
      result: { type: "object", asCell: true },  // For response to LLM
    },
  },
  // STATE SCHEMA - external cells to access
  {
    type: "object",
    properties: {
      memberships: { type: "array", asCell: true },
    },
  },
  // CALLBACK - self-contained, no closures over external functions
  (args, state) => {
    // ALL LOGIC INLINE - dedup, transformation, etc.
    const key = `${args.hotelBrand}:${args.membershipNumber}`;
    const current = state.memberships.get() || [];

    if (!current.some(m => `${m.hotelBrand}:${m.membershipNumber}` === key)) {
      state.memberships.set([...current, {
        id: `membership-${Date.now()}`,
        hotelBrand: args.hotelBrand,
        membershipNumber: args.membershipNumber,
      }]);
    }

    // Return confirmation to LLM
    args.result.set({ success: true });
  },
);

// Bind cell via state parameter, not closure
tools: {
  reportMembership: {
    description: "Report a found membership",
    handler: reportHandler({ memberships }),
  },
}
```

**Key differences:**
| Factory Pattern (broken) | Inline Pattern (works) |
|--------------------------|------------------------|
| Functions passed as config | Schemas as DATA |
| Logic in config callbacks | Logic INLINE in handler callback |
| Cells bound via closure | Cells bound via STATE PARAMETER |
| Not serializable | Fully serializable |

## Why This Matters

Framework author stated (2025-12-04):
> "The createReportTool handler factory won't work as expected once we do proper sandboxing (in particular the passing of functions and then creating handlers by closing over the passed in config)"

## Incremental Results Still Work

The inline pattern **preserves incremental behavior** - as the LLM calls the tool multiple times, items appear in the UI incrementally:

```typescript
// Each tool call adds an item that appears immediately
(args, state) => {
  const current = state.memberships.get() || [];
  state.memberships.set([...current, newItem]);  // UI updates immediately
  args.result.set({ success: true });
}
```

## Migration Checklist

When refactoring from factory pattern to inline pattern:

1. **Remove** the factory function (`createReportTool`, etc.)
2. **Identify** all functions passed as config (dedupeKey, toRecord, etc.)
3. **Move** that logic INLINE into the handler callback
4. **Define** input schema with all fields the LLM sends
5. **Define** state schema with cells to access (use `asCell: true`)
6. **Bind** cells when using the handler: `handler({ memberships })`

## Related

- See: `~/Code/labs/packages/runner/test/generate-object-tools.test.ts` for proper handler examples
- Related superstition: `2025-11-27-llm-handler-tools-must-write-to-result-cell.md`
- Affected patterns: `gmail-agentic-search.tsx`, `hotel-membership-gmail-agent.tsx`, `favorite-foods-gmail-agent.tsx`

---

**Discovery source:** Framework author feedback on CT-1098 investigation
