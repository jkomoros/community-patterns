# Cells Passed to Handlers from ifElse() Are Unwrapped

**Status:** Superstition (single observation, needs verification)

## The Problem

When you call a `handler()` from inside an `ifElse()` (or `derive()`) context and pass Cell arguments, those Cells are **auto-unwrapped to their values** before reaching the handler.

```typescript
// Handler expects Cells
const myHandler = handler<
  unknown,
  { selections: Cell<Record<string, boolean>> }
>((_, { selections }) => {
  selections.get();  // ❌ FAILS: "selections.get is not a function"
  selections.set({}); // ❌ FAILS: "selections.set is not a function"
});

// Inside ifElse - Cells get unwrapped!
{ifElse(
  hasItems,
  <button onClick={myHandler({ selections: stagedClassSelections })}>
    Click
  </button>,
  null
)}
```

**Error:** `TypeError: selections?.get is not a function`

## Why This Happens

The framework auto-unwraps reactive values in certain contexts. When you're inside `ifElse()`:
1. The handler invocation `myHandler({ selections: stagedClassSelections })` runs in the ifElse frame
2. The framework unwraps `stagedClassSelections` to its plain value
3. The handler receives `{ selections: { /* plain object */ } }` not `{ selections: Cell<...> }`

## Workaround: Plain Functions with Closure

Instead of using `handler()` with Cell parameters, define a plain function at pattern level that captures the Cell via closure:

```typescript
// Inside pattern function
const doSelectAll = (triageStatus: string, selected: boolean) => {
  // Direct closure access to the Cell - works!
  const current = stagedClassSelections.get() || {};
  const updated = { ...current };
  // ... modify updated ...
  stagedClassSelections.set(updated);
};

// Inside ifElse - works because it's a plain function call
{ifElse(
  hasItems,
  <button onClick={() => doSelectAll("auto_kept", true)}>
    Select All
  </button>,
  null
)}
```

**Why this works:**
- The plain function is defined at pattern level, BEFORE any reactive context
- It captures `stagedClassSelections` directly in its closure
- The arrow function `() => doSelectAll(...)` creates a new closure that's safe to use in onClick

## Alternative: Move Buttons Outside ifElse

If possible, restructure to render the buttons outside the reactive context:

```typescript
// Button defined outside ifElse - Cells aren't unwrapped
<button onClick={myHandler({ selections: stagedClassSelections })}>
  Select All
</button>

{ifElse(hasItems, <ItemList />, null)}
```

## Key Insight

| Context | Cell Passed to Handler | Result |
|---------|----------------------|--------|
| Outside ifElse/derive | Cell | ✅ Handler gets Cell |
| Inside ifElse/derive | Cell | ❌ Handler gets unwrapped value |
| Plain function closure | (captured) | ✅ Function has Cell access |

## Related Docs

- `folk_wisdom/2025-12-14-opaque-ref-closure-frame-limitation.md` - Similar frame issues
- `superstitions/2025-12-03-derive-creates-readonly-cells-use-property-access.md` - derive makes cells read-only
- `blessed/computed-over-derive.md` - Prefer computed() over derive()

## Metadata

```yaml
topic: handler, ifelse, cell, unwrapping, frame
discovered: 2025-12-15
status: superstition
pattern: extracurricular-selector
```

## Guestbook

- 2025-12-15 - Discovered while trying to add All/None selection buttons to triage UI. Handlers called from inside ifElse() received plain objects instead of Cells, causing `.get() is not a function` errors. Workaround: plain functions with closure access. (extracurricular-selector / jkomoros)
