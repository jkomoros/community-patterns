# Never Use globalThis or Raw Input Elements

## Observation

When facing issues with two-way binding or input handling, you might be tempted to:
1. Use `globalThis.document` to access DOM elements directly
2. Use raw `<textarea>` or `<input>` elements instead of framework-provided components

**Don't do this.** These approaches bypass the framework's reactivity system and can cause:
- Inconsistent state between DOM and cells
- Type errors (DOM types not available in compilation)
- Broken persistence
- Unpredictable behavior
- **Values not updating in handlers** (handler reads stale/default value even after user input)

## What Doesn't Work

```typescript
// BAD: Using globalThis to access DOM
const setSynopsis = handler<...>((_, { synopsisText }) => {
  const doc = (globalThis as any).document;
  const inputEl = doc?.getElementById("my-input");
  const text = inputEl?.value; // Bypasses cell system
});

// BAD: Raw textarea without two-way binding
<textarea
  id="my-input"
  value={someCell}
  placeholder="..."
/>

// BAD: Raw input type="number" - value won't update cell!
<input
  type="number"
  value={branchFactorCell}
  min="1"
  max="10"
/>
// When user changes value to 3, branchFactorCell.get() still returns 1!
```

## Why It's Bad

1. **Type Safety**: DOM types like `document`, `HTMLTextAreaElement` are not available in the pattern compilation environment
2. **Reactivity**: Direct DOM access bypasses the framework's cell tracking
3. **Persistence**: Values read from DOM may not persist correctly
4. **Architecture**: Goes against the framework's design principles
5. **Two-way binding failure**: Raw `value={cell}` displays the cell but doesn't UPDATE the cell when user types

## What To Do Instead

**Use `<ct-input $value={cell}>` with the `$value` binding:**

```typescript
// GOOD: Text input with proper two-way binding
<ct-input
  $value={synopsisText}
  placeholder="Enter your story synopsis..."
  style="width: 100%; padding: 12px;"
/>

// GOOD: Number input with proper two-way binding
<ct-input
  type="number"
  $value={branchFactorCell}
  min="1"
  max="10"
  style="width: 80px; padding: 8px;"
/>
```

If two-way binding still isn't working:

1. **Check if input is inside `ifElse`**: This is a known issue (see `2025-11-30-ifelse-input-binding.md`)
2. **Set default values**: Pre-populate cells with useful defaults so user doesn't need to modify
3. **Rearchitect**: Consider if the data flow can be restructured to avoid the problem

## Tags

- globalThis
- textarea
- input
- DOM
- reactivity
- architecture
- ct-input
- two-way-binding

## Confirmation Status

- **First observed**: 2025-11-30
- **Confirmed by**: User correction - "NO NO NO NEVER USE globalThis"
- **Confirmed by**: jkomoros - branch factor `<input type="number">` wasn't updating cell; fixed with `<ct-input type="number" $value={cell}>`

