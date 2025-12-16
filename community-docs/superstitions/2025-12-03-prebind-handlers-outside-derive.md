# Pre-bind Handlers Outside computed() Callbacks to Avoid ReadOnlyAddressError

**SUPERSTITION** - Single observation, unverified. Use with skepticism!

## Topic

Using onClick handlers inside `computed()` blocks without getting `ReadOnlyAddressError`

## Problem

When you bind a handler inside a `computed()` callback, the Cell references become read-only proxies, causing `ReadOnlyAddressError` when the handler tries to `.set()` values.

### What Didn't Work

```typescript
const completeScan = handler<unknown, { lastScanAt: Cell<number>, isScanning: Cell<boolean> }>(
  (_, state) => {
    state.lastScanAt.set(Date.now());  // ReadOnlyAddressError!
    state.isScanning.set(false);
  }
);

return {
  [UI]: (
    {computed(() =>
      scanCompleted ? (
        <ct-button
          onClick={completeScan({ lastScanAt, isScanning })}  // Binding INSIDE computed
        >
          Done
        </ct-button>
      ) : null
    )}
  )
};
```

**Symptom:** `ReadOnlyAddressError: Cannot write to read-only address: data:application/json,...`

**Why:** When `completeScan({ lastScanAt, isScanning })` is called inside the computed callback, the Cell references (`lastScanAt`, `isScanning`) have already been transformed into read-only proxies by the computed context.

## Solution That Worked

**Pre-bind handlers OUTSIDE the computed callback**, then reference the pre-bound handler inside:

```typescript
const completeScan = handler<unknown, { lastScanAt: Cell<number>, isScanning: Cell<boolean> }>(
  (_, state) => {
    state.lastScanAt.set(Date.now());
    state.isScanning.set(false);
  }
);

// Pre-bind BEFORE the return statement (outside any computed/map context)
const boundCompleteScan = completeScan({ lastScanAt, isScanning });

return {
  [UI]: (
    {computed(() =>
      scanCompleted ? (
        <ct-button
          onClick={boundCompleteScan}  // Just reference, don't bind here
        >
          Done
        </ct-button>
      ) : null
    )}
  )
};
```

**Result:** No ReadOnlyAddressError! The Cells retain their methods because they were captured at pre-bind time (in the pattern scope), not inside the computed context.

## Why This Works

1. **At pre-bind time** (outside computed): Cells are real Cells with `.set()`, `.get()` methods intact
2. **The bound handler** captures these real Cell references in its closure
3. **Inside computed**: We only pass a reference to the already-bound handler function
4. **When clicked**: The handler executes with the original Cell references, not the read-only proxies

```
Pattern scope:  Cell → handler binding → bound handler (Cells intact)
Computed scope: bound handler reference → onClick (no Cell binding here)
Click time:     bound handler executes with original Cells
```

## When to Use This

Use pre-binding when:
- You need onClick inside a computed() block
- The handler needs to modify Cells from outer scope
- Restructuring the UI to avoid computed isn't practical

## Alternative Approaches

The folk wisdom recommends other approaches that also work:

**1. Move button outside computed entirely:**
```typescript
<ct-button
  onClick={myHandler({ cells })}
  disabled={computed(() => !condition)}
>
  {computed(() => condition ? "Ready" : "Not Ready")}
</ct-button>
```

**2. Use ifElse instead of computed for simple conditions:**
```typescript
{ifElse(
  isAuthenticated,  // Plain cell, not computed
  <ct-button onClick={myHandler({ cells })}>Action</ct-button>,
  null
)}
```

Pre-binding is useful when you can't easily restructure, or when the computed logic is complex.

## Context

- **Pattern:** gmail-agentic-search.tsx (base pattern for Gmail agents)
- **Use case:** "Done" button inside `computed(() => scanCompleted ? ... : null)` to reset scanning state
- **Framework:** CommonTools with TypeScript
- **Also affected:** Start Scan and Stop Scan buttons (pre-bound for consistency)

## Related

- **Folk Wisdom: onClick Handlers Should Not Be Inside Conditional Rendering** - Documents the core problem and other solutions
- **Superstition: Pass Cells as Handler Parameters, Not Closure** - Related Cell unwrapping issue in reactive contexts

## Metadata

```yaml
topic: handlers, computed, onClick, cells, pre-binding, ReadOnlyAddressError
discovered: 2025-12-03
confirmed_count: 1
last_confirmed: 2025-12-03
sessions: [gmail-agentic-search-refactor-bug-fix]
related_functions: handler, computed, Cell.set
related_docs:
  - folk_wisdom/onclick-handlers-conditional-rendering.md
  - superstitions/2025-01-24-pass-cells-as-handler-params-not-closure.md
status: superstition
```

## Guestbook

- 2025-12-03 - Building gmail-agentic-search base pattern. "Done" button inside `computed(() => scanCompleted ? ... : null)` got ReadOnlyAddressError when clicked. Handler was being bound inside the computed callback. Fix: pre-bind all handlers (`boundStartScan`, `boundStopScan`, `boundCompleteScan`) in pattern scope before the return statement. Reference these pre-bound handlers in the UI. Works perfectly - Stop Scan and Start Scan buttons now toggle correctly without errors. (gmail-agentic-search-refactor-bug-fix)

---

**Remember: This is a SUPERSTITION - just one observation. The folk wisdom alternatives (move button outside computed, use ifElse) are more proven. Test thoroughly in your own context!**
