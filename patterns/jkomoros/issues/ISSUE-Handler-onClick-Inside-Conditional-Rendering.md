# ISSUE: Handler onClick Inside Conditional Rendering (ifElse/derive)

## Problem

Calling handlers with `onClick` from inside conditional rendering blocks (`ifElse` or `derive`) causes infinite loops or deployment timeouts when the handler parameters include cells from outer scope.

## Minimal Reproduction

```tsx
// Setup
const uploadedImage = cell<ImageData | null>(null);
const { result: imageTextResult, pending: imageExtractionPending } = generateObject({...});

// Handler definition
const applyImageText = handler<
  Record<string, never>,
  {
    notes: Cell<string>;
    uploadedImage: Cell<ImageData | null>;
    extractedText: string;
  }
>(
  (_, { notes, uploadedImage, extractedText }) => {
    const currentNotes = notes.get();
    const newNotes = currentNotes
      ? `${currentNotes}\n\n---\n\n${extractedText}`
      : extractedText;
    notes.set(newNotes);
    uploadedImage.set(null);
  }
);

// PROBLEMATIC PATTERN 1: Using derive() with onClick
{derive({ pending: imageExtractionPending, result: imageTextResult }, ({ pending, result }) => {
  if (pending) {
    return <div>Loading...</div>;
  }

  if (!result?.extractedText) return <div />;

  return (
    <div>
      <span>✓ Text extracted</span>
      <ct-button
        onClick={applyImageText({ notes, uploadedImage, extractedText: result.extractedText })}
      >
        Add to Notes
      </ct-button>
    </div>
  );
})}

// PROBLEMATIC PATTERN 2: Using ifElse() with onClick and derived parameter
{ifElse(
  derive(imageTextResult, (result) => result && result.extractedText),
  <div>
    <span>✓ Text extracted</span>
    <ct-button
      onClick={applyImageText({
        notes,
        uploadedImage,
        extractedText: derive(imageTextResult, (r) => r?.extractedText || "")
      })}
    >
      Add to Notes
    </ct-button>
  </div>,
  null
)}
```

## Symptoms

- **Pattern 1 (derive with onClick)**: Error message: `Cannot create cell link: space is required. This can happen when closing over (opaque) cells in a lift or derive. Instead pass those cells into the lift or derive directly as Cell<> inputs.`

- **Pattern 2 (ifElse with onClick + derived param)**: Deployment times out (infinite loop), dev server becomes unresponsive

## Analysis

When calling a handler from inside a conditional rendering block:
1. Cells from outer scope (`notes`, `uploadedImage`) become opaque when accessed inside `derive()`
2. Passing a `derive()` expression as a handler parameter seems to create a reactive loop
3. The handler invocation is re-evaluated every render, potentially creating circular dependencies

## What Works

**Pattern A: Handler onClick directly in main UI (no conditional)**
```tsx
// This works fine
<ct-button
  onClick={triggerExtraction({ notes, extractTrigger })}
  disabled={extractionPending}
>
  Extract Recipe Data
</ct-button>
```

**Pattern B: Computed value + separate handler call**
```tsx
// Create a computed value for the extracted text
const extractedText = derive(imageTextResult, (r) => r?.extractedText || "");

// Use it in conditional rendering without onClick
{ifElse(
  derive(extractedText, (text) => text.length > 0),
  <div>
    <span>✓ Text extracted: {extractedText}</span>
    {/* Button here would still be problematic */}
  </div>,
  null
)}
```

## Questions for Framework Authors

1. **Is this expected behavior?** Should `onClick` handlers never be called from inside `derive()` or `ifElse()` blocks?

2. **Is there a recommended pattern** for conditional UI that includes buttons with onClick handlers?

3. **Why does passing a derived value as a handler parameter create an infinite loop?** Even though the handler itself doesn't create cycles, something about the parameter binding seems to trigger infinite re-evaluation.

4. **Should the framework detect this pattern and provide a better error message?** Currently Pattern 1 gives a helpful error, but Pattern 2 just hangs.

## Workaround Needed

What's the correct way to:
- Show conditional UI based on async operation state
- Include an action button in that conditional UI
- Pass both cells and derived values to the handler

## Context

- **Pattern**: food-recipe.tsx (lines 1208-1252 in broken version)
- **Use case**: Image upload → text extraction → "Add to Notes" button
- **Framework version**: Current as of 2025-11-23
- **Related errors**: "Cannot create cell link: space is required" (opaque cells)

## Attempted Solutions

1. ✅ **Move handler outside derive**: Works for simple cases
2. ❌ **Use ifElse instead of derive**: Still causes infinite loop with derived parameters
3. ❌ **Pass derive() as parameter**: Creates infinite loop
4. ❌ **Capture cells via closure**: Creates opaque cell error
5. ⏳ **Unknown working solution**: Need framework guidance

---

**Status**: BLOCKED - Need framework author input on correct pattern
