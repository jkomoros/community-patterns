# Cells Not Unwrapped in derive() - Broader Than Expected

**Date:** 2025-12-08
**Status:** Superstition (two observations, needs broader verification)
**Symptom:** derive callback receives cell reference object instead of value for non-framework cells

## The Problem

When you pass cells to `derive()`, the callback may receive the cell reference object instead of the unwrapped value. This affects:

1. **Locally-created cells** - `cell<T>()` created in pattern body
2. **Cells passed from parent patterns** - cells passed as inputs from a parent pattern

**Observed:**
```
[DEBUG] derive triggered: lastCount={"cell":{"/":"baedrei..."},"path":["internal","__#7"]}
```

This causes comparisons like `currentCount > lastCount` to fail because you're comparing a number to an object.

## Which Cells ARE Unwrapped vs NOT Unwrapped

| Cell Type | In derive callback | Needs .get()? |
|-----------|-------------------|---------------|
| Framework input cells with `Default<>` | Value unwrapped automatically | No |
| Locally-created cells (`cell<T>()`) | Cell reference object | **Yes** |
| Cells passed from parent patterns | Cell reference object | **Yes** |

**Key insight:** Only cells that come directly from the framework's pattern input mechanism with `Default<>` types appear to be unwrapped. Any cell you create with `cell<T>()` or receive as a passed parameter needs `.get()`.

## Wrong Pattern

```typescript
// Example 1: Locally-created cell
const pattern = pattern<Input, Output>(({ inputCell }) => {
  const localCell = cell<number>(0);

  // ❌ WRONG - localCell is not unwrapped
  derive([inputCell, localCell], ([inputValue, localValue]: [string, number]) => {
    // localValue may be {cell: {...}, path: [...]} instead of number!
    if (localValue > 5) { /* This comparison fails */ }
  });
});

// Example 2: Cell passed from parent pattern
const ChildPattern = pattern<{
  parentSignal: Cell<number>;
}, Output>(({ parentSignal }) => {
  // ❌ WRONG - parentSignal is also not unwrapped!
  derive([parentSignal], ([signalValue]: [number]) => {
    // signalValue may be {cell: {...}, path: [...]} instead of number!
    console.log(`Signal: ${signalValue}`); // Logs "[object Object]"
  });
});
```

## Correct Pattern

```typescript
// Example 1: Locally-created cell
const pattern = pattern<Input, Output>(({ inputCell }) => {
  const localCell = cell<number>(0);

  // ✅ CORRECT - Use .get() for all non-framework cells
  derive([inputCell, localCell], ([inputValue, _localRef]: [string, number]) => {
    const localValue = localCell.get() || 0;
    if (localValue > 5) { /* This works */ }
  });
});

// Example 2: Cell passed from parent pattern
const ChildPattern = pattern<{
  parentSignal: Cell<number>;
}, Output>(({ parentSignal }) => {
  // ✅ CORRECT - Use .get() for passed-in cells too!
  derive([parentSignal], ([_signalRef]: [number]) => {
    const signalValue = parentSignal.get() || 0;
    console.log(`Signal: ${signalValue}`); // Logs "0" (correct)
  });
});
```

## Why Keep the Local Cell in the Dependency Array?

Even though you use `.get()` to read the value, keep the cell in the dependency array so the derive re-runs when the cell changes:

```typescript
// Cell is in array (triggers re-run) but value is read with .get()
derive([memberships, localCountCell], ([list, _ref]) => {
  const localCount = localCountCell.get() || 0;  // Read actual value
  // ... rest of logic
});
```

## Observed Context

### Observation 1: Locally-created cell
- **Pattern:** hotel-membership-gmail-agent.tsx
- **Local cell:** `const lastMembershipCountCell = cell<number>(0);`
- **In derive:** Value was `{"cell":{...},"path":["internal","__#7"]}` instead of `0`
- **Fix:** Used `lastMembershipCountCell.get() || 0` inside derive callback

### Observation 2: Cell passed from parent pattern
- **Pattern:** gmail-agentic-search.tsx (base pattern)
- **Passed cell:** `itemFoundSignal: Cell<number>` - passed from hotel-membership-gmail-agent.tsx
- **In derive:** Value was `{"cell":{...},"path":["internal","__#8"]}` instead of `0`
- **Fix:** Used `itemFoundSignal.get() || 0` inside derive callback
- **Note:** This cell was created in the parent pattern and passed down - it's NOT a framework input cell

## Contradicts Folk Wisdom?

Note: This seems to contradict `community-docs/folk_wisdom/derive-object-parameter-cell-unwrapping.md` which says values ARE directly usable. The difference may be:
- Pattern input cells (from destructuring `({ cell })`) ARE unwrapped
- Locally-created cells (`cell<T>()`) are NOT unwrapped

This distinction needs further investigation.

## Metadata

```yaml
topic: reactivity, derive, cells, unwrapping
discovered: 2025-12-08
confirmed_count: 2
last_confirmed: 2025-12-08
sessions: [hotel-membership-saved-queries-debug, gmail-agentic-search-reliability]
related_labs_docs: none found
status: superstition
stars: ⭐⭐
```

## Guestbook

- 2025-12-08 - Debugging saved queries not showing in hotel-membership pattern. The derive watching memberships used `lastMembershipCountCell = cell<number>(0)`. Debug log showed `lastCount` was an object `{"cell":{...},"path":["internal","__#7"]}` instead of `0`. Fixed by using `lastMembershipCountCell.get()` inside the derive callback. (hotel-membership-saved-queries-debug)

- 2025-12-08 - Extended finding: itemFoundSignal cell passed FROM hotel-membership-gmail-agent TO gmail-agentic-search was ALSO not unwrapped in derive. Debug log showed `signalValue={"cell":{...},"path":["internal","__#8"]} (type: object)` instead of a number. This proves it's not just locally-created cells - cells passed from parent patterns are also affected. Fixed by using `.get()` for ALL cells in the derive. (gmail-agentic-search-reliability)

---

**Remember: This is a SUPERSTITION - two observations so far. The pattern is consistent but needs broader verification!**
