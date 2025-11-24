# ⚠️ SUPERSTITION: onClick Handlers Should Not Be Inside Conditional Rendering

**⚠️ WARNING: This is a SUPERSTITION - unverified folk knowledge from a single observation.**

This may be wrong, incomplete, or context-specific. Use with extreme skepticism and verify thoroughly!

## Topic

Using onClick handlers with conditional rendering in JSX (derive, ifElse)

## Problem

Calling handlers via `onClick` from inside conditional rendering blocks (`derive()` or `ifElse()`) causes either opaque cell errors or infinite reactive loops, especially when the handler needs to access cells from the outer scope.

### What Didn't Work

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

**Symptom:** Error: `Cannot create cell link: space is required. This can happen when closing over (opaque) cells in a lift or derive.`

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

## Solution That Seemed to Work

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

**Result:** No opaque cell errors, no infinite loops, button works correctly.

## Context

- **Pattern:** food-recipe.tsx (image text extraction "Add to Notes" button)
- **Use case:** Button that should only be active after async operation completes
- **Framework:** CommonTools JSX with reactive cells
- **Error types:** "Cannot create cell link: space is required" OR infinite reactive loop (timeout)

## Theory / Hypothesis

When you call a handler from inside `derive()` or `ifElse()`:
1. Any cells you pass as parameters that come from outer scope become "opaque" inside the conditional block
2. Passing derived values as parameters creates reactive dependencies that re-evaluate on every render
3. This can create circular reactive loops: button click → handler runs → state changes → derive re-evaluates → button re-renders → handler invocation re-evaluates → loop

The framework seems designed to keep interactive handlers (onClick) at the "static" UI layer, not inside the "reactive" UI layer.

## Alternative Patterns

If you truly need conditional rendering of the entire button:

**Option 1: Conditional button with simple handler (no cell parameters)**
```typescript
{ifElse(
  someCondition,
  <ct-button onClick={simpleHandler()}>  // No cells passed as parameters
    Do Something
  </ct-button>,
  null
)}

const simpleHandler = handler<...>(() => {
  // Access cells from closure (at handler execution time, not binding time)
  const value = someCell.get();
  // ...
});
```

**Note:** This pattern might still have issues - not fully tested. Safer to avoid conditional rendering of onClick buttons entirely.

## Comparison to React

This pattern is similar to React best practices:
- In React, you typically don't conditionally render interactive buttons
- Instead, you render them and control behavior via `disabled`, `className`, or early returns
- Conditional rendering is more for passive display elements

## Related Patterns

- **Superstition: Reactive Style Objects** - Similar issue with reactive values inside JSX objects
- **Issue File: Handler onClick Inside Conditional Rendering** - Full technical analysis for framework authors

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
confirmed_count: 1
last_confirmed: 2025-01-23
sessions: [fix-food-recipe-image-extraction-button-error]
related_issues: ISSUE-Handler-onClick-Inside-Conditional-Rendering.md
status: superstition
stars: ⭐⭐⭐
```

## Guestbook

- ⭐⭐⭐ 2025-01-23 - Fixed "Add to Notes" button in food-recipe pattern after HOURS of debugging. Initially wrapped onClick in derive(), got opaque cell error. Tried ifElse with derived parameters, got infinite loop. Finally removed ALL conditional rendering around the button - just used disabled attribute instead. Worked immediately. (fix-food-recipe-image-extraction-button-error)

---

**Remember: This is just one observation. Test thoroughly in your own context!**

**IMPORTANT:** If you encounter this pattern, try the simple solution FIRST - remove conditional rendering, use disabled instead. Don't waste hours like I did!
