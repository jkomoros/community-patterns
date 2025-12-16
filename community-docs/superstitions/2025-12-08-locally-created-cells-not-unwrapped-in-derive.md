# Cells Not Unwrapped in computed() - Broader Than Expected

**Date:** 2025-12-08
**Status:** Superstition (two observations, needs broader verification)
**Symptom:** computed callback receives cell reference object instead of value for non-framework cells

## The Problem

When you access cells inside `computed()`, local cells may provide the cell reference object instead of the unwrapped value. This affects:

1. **Locally-created cells** - `Cell.of<T>()` created in pattern body
2. **Cells passed from parent patterns** - cells passed as inputs from a parent pattern

**Observed:**
```
[DEBUG] computed triggered: lastCount={"cell":{"/":"baedrei..."},"path":["internal","__#7"]}
```

This causes comparisons like `currentCount > lastCount` to fail because you're comparing a number to an object.

## Which Cells ARE Unwrapped vs NOT Unwrapped

| Cell Type | In computed callback | Needs .get()? |
|-----------|-------------------|---------------|
| Framework input cells with `Default<>` | Value unwrapped automatically | No |
| Locally-created cells (`Cell.of<T>()`) | Cell reference object | **Yes** |
| Cells passed from parent patterns | Cell reference object | **Yes** |

**Key insight:** Only cells that come directly from the framework's pattern input mechanism with `Default<>` types appear to be unwrapped. Any cell you create with `Cell.of<T>()` or receive as a passed parameter needs `.get()`.

## Wrong Pattern

```typescript
// Example 1: Locally-created cell
const myPattern = pattern<Input, Output>(({ inputCell }) => {
  const localCell = Cell.of<number>(0);

  // ❌ WRONG - localCell is not unwrapped
  computed(() => {
    // localCell may be {cell: {...}, path: [...]} instead of number!
    if (localCell > 5) { /* This comparison fails */ }
  });
});

// Example 2: Cell passed from parent pattern
const ChildPattern = pattern<{
  parentSignal: Cell<number>;
}, Output>(({ parentSignal }) => {
  // ❌ WRONG - parentSignal is also not unwrapped!
  computed(() => {
    // parentSignal may be {cell: {...}, path: [...]} instead of number!
    console.log(`Signal: ${parentSignal}`); // Logs "[object Object]"
  });
});
```

## Correct Pattern

```typescript
// Example 1: Locally-created cell
const myPattern = pattern<Input, Output>(({ inputCell }) => {
  const localCell = Cell.of<number>(0);

  // ✅ CORRECT - Use .get() for all non-framework cells
  computed(() => {
    const localValue = localCell.get() || 0;
    if (localValue > 5) { /* This works */ }
  });
});

// Example 2: Cell passed from parent pattern
const ChildPattern = pattern<{
  parentSignal: Cell<number>;
}, Output>(({ parentSignal }) => {
  // ✅ CORRECT - Use .get() for passed-in cells too!
  computed(() => {
    const signalValue = parentSignal.get() || 0;
    console.log(`Signal: ${signalValue}`); // Logs "0" (correct)
  });
});
```

## Why Does computed() Still Track These Cells?

Even though you use `.get()` to read the value, computed() automatically tracks the cell access and re-runs when the cell changes.

```typescript
// Cell is tracked automatically when you call .get()
computed(() => {
  const localCount = localCountCell.get() || 0;  // Read actual value, triggers re-run on change
  // ... rest of logic
});
```

## Observed Context

### Observation 1: Locally-created cell
- **Pattern:** hotel-membership-gmail-agent.tsx
- **Local cell:** `const lastMembershipCountCell = Cell.of<number>(0);`
- **In computed:** Value was `{"cell":{...},"path":["internal","__#7"]}` instead of `0`
- **Fix:** Used `lastMembershipCountCell.get() || 0` inside computed callback

### Observation 2: Cell passed from parent pattern
- **Pattern:** gmail-agentic-search.tsx (base pattern)
- **Passed cell:** `itemFoundSignal: Cell<number>` - passed from hotel-membership-gmail-agent.tsx
- **In computed:** Value was `{"cell":{...},"path":["internal","__#8"]}` instead of `0`
- **Fix:** Used `itemFoundSignal.get() || 0` inside computed callback
- **Note:** This cell was created in the parent pattern and passed down - it's NOT a framework input cell

## Contradicts Folk Wisdom?

Note: This seems to contradict `community-docs/folk_wisdom/derive-object-parameter-cell-unwrapping.md` which says values ARE directly usable. The difference may be:
- Pattern input cells (from destructuring `({ cell })`) ARE unwrapped
- Locally-created cells (`Cell.of<T>()`) are NOT unwrapped

This distinction needs further investigation.

## Metadata

```yaml
topic: reactivity, computed, cells, unwrapping
discovered: 2025-12-08
confirmed_count: 2
last_confirmed: 2025-12-08
sessions: [hotel-membership-saved-queries-debug, gmail-agentic-search-reliability]
related_labs_docs: none found
status: superstition
stars: ⭐⭐
```

## Guestbook

- 2025-12-08 - Debugging saved queries not showing in hotel-membership pattern. The computed watching memberships used `lastMembershipCountCell = Cell.of<number>(0)`. Debug log showed `lastCount` was an object `{"cell":{...},"path":["internal","__#7"]}` instead of `0`. Fixed by using `lastMembershipCountCell.get()` inside the computed callback. (hotel-membership-saved-queries-debug)

- 2025-12-08 - Extended finding: itemFoundSignal cell passed FROM hotel-membership-gmail-agent TO gmail-agentic-search was ALSO not unwrapped in computed. Debug log showed `signalValue={"cell":{...},"path":["internal","__#8"]} (type: object)` instead of a number. This proves it's not just locally-created cells - cells passed from parent patterns are also affected. Fixed by using `.get()` for ALL cells in the computed. (gmail-agentic-search-reliability)

---

**Remember: This is a SUPERSTITION - two observations so far. The pattern is consistent but needs broader verification!**
