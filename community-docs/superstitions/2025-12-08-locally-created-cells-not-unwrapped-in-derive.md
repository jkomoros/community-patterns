# Locally-Created Cells Not Unwrapped in derive()

**Date:** 2025-12-08
**Status:** Superstition (single observation, needs verification)
**Symptom:** derive callback receives cell reference object instead of value for locally-created cells

## The Problem

When you create a cell with `cell<T>()` in the pattern body and pass it to `derive()`, the callback may receive the cell reference object instead of the unwrapped value.

**Observed:**
```
[DEBUG] derive triggered: lastCount={"cell":{"/":"baedrei..."},"path":["internal","__#7"]}
```

This causes comparisons like `currentCount > lastCount` to fail because you're comparing a number to an object.

## Pattern Input Cells vs Locally-Created Cells

| Cell Type | In derive callback | Needs .get()? |
|-----------|-------------------|---------------|
| Pattern input cells | Value unwrapped automatically | No |
| Locally-created cells (`cell<T>()`) | May be cell reference | Yes (use `.get()`) |

## Wrong Pattern

```typescript
const pattern = pattern<Input, Output>(({ inputCell }) => {
  // Local cell created in pattern body
  const localCell = cell<number>(0);

  // ❌ WRONG - localCell may not be unwrapped
  derive([inputCell, localCell], ([inputValue, localValue]: [string, number]) => {
    // inputValue works (pattern input)
    // localValue may be {cell: {...}, path: [...]} instead of number!
    if (localValue > 5) { /* This comparison fails */ }
  });
});
```

## Correct Pattern

```typescript
const pattern = pattern<Input, Output>(({ inputCell }) => {
  // Local cell created in pattern body
  const localCell = cell<number>(0);

  // ✅ CORRECT - Use .get() for locally-created cells
  derive([inputCell, localCell], ([inputValue, _localRef]: [string, number]) => {
    // inputValue works (pattern input)
    // Use .get() to read the actual value
    const localValue = localCell.get() || 0;
    if (localValue > 5) { /* This works */ }
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

- **Pattern:** hotel-membership-gmail-agent.tsx
- **Local cell:** `const lastMembershipCountCell = cell<number>(0);`
- **In derive:** Value was `{"cell":{...},"path":["internal","__#7"]}` instead of `0`
- **Fix:** Used `lastMembershipCountCell.get() || 0` inside derive callback

## Contradicts Folk Wisdom?

Note: This seems to contradict `community-docs/folk_wisdom/derive-object-parameter-cell-unwrapping.md` which says values ARE directly usable. The difference may be:
- Pattern input cells (from destructuring `({ cell })`) ARE unwrapped
- Locally-created cells (`cell<T>()`) are NOT unwrapped

This distinction needs further investigation.

## Metadata

```yaml
topic: reactivity, derive, cells, unwrapping
discovered: 2025-12-08
confirmed_count: 1
last_confirmed: 2025-12-08
sessions: [hotel-membership-saved-queries-debug]
related_labs_docs: none found
status: superstition
stars: ⭐
```

## Guestbook

- 2025-12-08 - Debugging saved queries not showing in hotel-membership pattern. The derive watching memberships used `lastMembershipCountCell = cell<number>(0)`. Debug log showed `lastCount` was an object `{"cell":{...},"path":["internal","__#7"]}` instead of `0`. Fixed by using `lastMembershipCountCell.get()` inside the derive callback. (hotel-membership-saved-queries-debug)

---

**Remember: This is a SUPERSTITION - just one observation. Test thoroughly in your own context!**
