# onClick Handlers Should Not Be Inside Conditional Rendering

**Folk Wisdom** - Verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

## Topic

Using onClick handlers with conditional rendering in JSX (derive, ifElse)

## Problem

Calling handlers via `onClick` from inside conditional rendering blocks (`derive()` or `ifElse()`) causes either:
- `ReadOnlyAddressError: Cannot write to read-only address`
- `Cannot create cell link: space is required` errors
- Infinite reactive loops

This happens especially when the handler needs to access cells from the outer scope.

### What Doesn't Work

**Pattern 1: onClick inside derive()**
```typescript
{derive({ pending, result }, ({ pending, result }) => {
  if (pending) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <ct-button
        onClick={myHandler({ someCell, value: result.extractedValue })}
      >
        Do Something
      </ct-button>
    </div>
  );
})}
```

**Symptom:** Error: `ReadOnlyAddressError: Cannot write to read-only address` or `Cannot create cell link: space is required`

**Pattern 2: onClick inside ifElse with derived parameter**
```typescript
{ifElse(
  someCondition,
  <ct-button
    onClick={myHandler({
      someCell,
      value: derive(otherCell, (v) => v.prop)
    })}
  >
    Do Something
  </ct-button>,
  null
)}
```

**Symptom:** Deployment times out with infinite loop. Dev server becomes unresponsive.

## Solution

**Always render the button at the top level** (not inside conditional blocks), and use other mechanisms for conditional behavior:

```typescript
// ✅ Button always rendered, no conditional wrapper
<ct-button
  onClick={myHandler({ someCell, otherCell })}
  disabled={somePendingState}  // Use disabled for conditional states
>
  {somePendingState ? "Processing..." : "Do Something"}  // Conditional text is fine
</ct-button>
```

**Handler handles conditions internally:**
```typescript
const myHandler = handler<...>(
  (_, { someCell, otherCell }) => {
    const value = otherCell.get();
    if (!value?.extractedData) return;  // Early return if not ready

    // Do the actual work
    someCell.set(value.extractedData);
  }
);
```

**You can use derive() for button content and disabled state:**
```typescript
<ct-button
  onClick={myHandler({ myCell })}
  disabled={derive(isScanning, (scanning) => !scanning)}
>
  {derive(isScanning, (scanning) => scanning ? "⏹ Stop" : "Stopped")}
</ct-button>
```

**Result:** No opaque cell errors, no infinite loops, button works correctly.

## Why This Happens

When you call a handler from inside `derive()` or `ifElse()`:
1. Cells from outer scope become "read-only proxies" inside the derive context
2. Any `.set()` call fails because the Cell reference is read-only
3. Passing derived values as parameters creates reactive dependencies that re-evaluate on every render
4. This can create circular reactive loops

The framework keeps interactive handlers (onClick) at the "static" UI layer, not inside the "reactive" UI layer.

## Related

- **Folk Wisdom: Handlers Inside derive() Cause ReadOnlyAddressError** (`reactivity.md`)
- **Superstition: Pass Cells as Handler Parameters** - Related closure/handler issues

## Formula / Rule of Thumb

```
Interactive handlers (onClick) → Top-level UI (always rendered)
Conditional behavior → disabled attribute + handler early returns
Conditional display → Text content, styles, or separate passive elements
```

## Metadata

```yaml
topic: jsx, handlers, conditional-rendering, onClick, derive, ifElse
discovered: 2025-01-23
confirmed_count: 4
last_confirmed: 2025-11-30
sessions: [fix-food-recipe-image-extraction-button-error, smart-rubric-phase-5, hotel-membership-extractor-stop-scan, spindle-board-inspire-me]
status: folk_wisdom
stars: ⭐⭐⭐
```

## Guestbook

- ✅ 2025-01-23 - Fixed "Add to Notes" button in food-recipe pattern after HOURS of debugging. Initially wrapped onClick in derive(), got opaque cell error. Tried ifElse with derived parameters, got infinite loop. Finally removed ALL conditional rendering around the button - just used disabled attribute instead. Worked immediately. (fix-food-recipe-image-extraction-button-error)

- ✅ 2025-11-25 - Confirmed in smart-rubric-phase-5 with generateObject results. Buttons inside derive block got ReadOnlyAddressError. (smart-rubric-phase-5)

- ✅ 2025-11-27 - **CONFIRMED AGAIN** in hotel-membership-extractor. Added "Stop Scan" button inside derive progress block. Got `ReadOnlyAddressError: Cannot write to read-only address` when clicking. Moved button OUTSIDE derive, used `disabled={derive(isScanning, ...)}` for conditional state. Works perfectly. This pattern is solid! (hotel-membership-extractor-stop-scan)

- ✅ 2025-11-30 - **NEW TECHNIQUE DISCOVERED** in spindle-board "Inspire Me" feature. Needed to render buttons for each LLM-generated idea. Used `.map()` on pre-computed cell instead of inside derive callback: `ideasWithJson.map((idea) => <button onClick={handler(...)} />)`. This works because the onClick is NOT inside a derive callback - it's at top-level JSX mapping over a reactive cell. Also used two-phase selection (click to select index, then separate "Apply" button) to work around read-only data from LLM results. (spindle-board-inspire-me)

---

**IMPORTANT:** If you encounter this pattern, try the simple solution FIRST - move button outside derive/ifElse, use disabled attribute instead. Don't waste hours debugging!
