# Helper Functions Returning JSX May Not Render

**Source: Community debugging session, December 2025**

## Summary

Helper functions that return JSX elements may not render correctly in recipes. Inline the JSX directly instead.

## The Problem

```typescript
// DON'T DO THIS - button may not render
const renderPinButton = (isPinned: Derived<boolean>, toggleHandler: Handler) => (
  <button onClick={toggleHandler} style={{...}}>
    {ifElse(isPinned, "📌 Pinned", "📍 Pin")}
  </button>
);

// In JSX:
<ct-hstack>
  <span>Notes</span>
  {renderPinButton(isNotesPinned, toggleNotesPin)}  {/* May not render! */}
</ct-hstack>
```

## The Solution

```typescript
// DO THIS - inline the JSX directly
<ct-hstack>
  <span>Notes</span>
  <button
    onClick={toggleNotesPin}
    style={{...}}
  >
    {ifElse(isNotesPinned, "📌 Pinned", "📍 Pin")}
  </button>
</ct-hstack>
```

## Why This Happens

Unknown. The helper function approach works in standard React but appears to have issues in the commontools recipe/JSX rendering pipeline. The button element simply doesn't appear in the DOM when returned from a helper function.

## Symptoms

- Element exists in code but doesn't appear in UI
- No console errors
- Accessibility snapshot shows parent elements but not the helper-returned element
- Works fine when same JSX is inlined

## Workaround

Always inline JSX elements directly in the render tree instead of extracting them into helper functions.

## Metadata

```yaml
topic: jsx, rendering, helper functions, recipes
observed_date: 2025-12-18
source: Community debugging - record.tsx pattern pin button
error_message: (none - silent failure)
```
