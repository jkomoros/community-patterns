# @ Reference Support for OpaqueRef Arrays

**Date:** 2025-11-22
**Author:** jkomoros
**Pattern:** meal-orchestrator.tsx
**Status:** Superstition (needs confirmation)

## Problem

Need to allow users to @ reference other patterns and add them to an array of `OpaqueRef<T>[]` in your pattern. For example, allowing users to @ mention food-recipe patterns to add them to a meal plan.

## Solution

Use `wish("#mentionable")` to access available charms and `ct-prompt-input` with `$mentionable` binding to enable @ referencing:

```typescript
import { wish, handler, OpaqueRef } from "commontools";

interface MyInput {
  recipes: Default<OpaqueRef<RecipeType>[], []>;
}

export default pattern<MyInput>(({ recipes }) => {
  // Get mentionable charms for @ references
  const mentionable = wish<any[]>("#mentionable");

  // Handler for adding via @ mentions
  const addRecipeMentions = handler<
    {
      detail: {
        text: string;
        mentions: Array<any>;
      };
    },
    {
      recipes: Cell<OpaqueRef<RecipeType>[]>;
    }
  >(({ detail }, { recipes }) => {
    const { mentions } = detail;

    if (mentions && mentions.length > 0) {
      const currentRecipes = recipes.get();
      const newRecipes = mentions.filter((mention: any) => {
        // Only add if not already in the list
        return !currentRecipes.some((existing) => {
          if (typeof existing === 'object' && 'equals' in existing) {
            return (existing as any).equals(mention);
          }
          return false;
        });
      });

      if (newRecipes.length > 0) {
        recipes.set([...currentRecipes, ...newRecipes]);
      }
    }
  });

  return {
    [UI]: (
      <ct-vstack>
        {/* Input for adding via @ mentions */}
        <ct-prompt-input
          placeholder="@ mention recipes to add them..."
          $mentionable={mentionable}
          onct-send={addRecipeMentions({ recipes })}
        />

        {/* Display added items */}
        <ct-vstack>
          {recipes.map((recipe) => (
            <div>{recipe.name}</div>
          ))}
        </ct-vstack>
      </ct-vstack>
    ),
    recipes,
  };
});
```

## Key Points

1. **`wish("#mentionable")`**: Accesses the list of charms available for @ referencing
2. **`ct-prompt-input`**: Component that supports @ mentions when given `$mentionable` prop
3. **`onct-send` event**: Receives `detail.mentions` array with the referenced charms
4. **Deduplication**: Check for existing items using `.equals()` method on cells
5. **Cell comparison**: Need to check `'equals' in existing` because cells have an `.equals()` method

## Alternative Components

- **`ct-code-editor`**: Also supports `$mentionable` and `$mentioned` (see note.tsx)
- **`ct-message-input`**: Simpler input without @ support

## Examples in Codebase

- **note.tsx**: Uses `ct-code-editor` with `$mentionable`, `$mentioned`, and `onbacklink-create`
- **chatbot.tsx**: Uses `ct-prompt-input` with `$mentionable` and `onct-send`

## Observations

- The `wish("#mentionable")` call seems to be a special path that provides access to charms
- The `mentions` array in the event contains Cell references to the mentioned charms
- Need to use `.equals()` for cell comparison, not `===`
- Both `ct-prompt-input` and `ct-code-editor` have built-in @ mention UI/UX

## Questions / Needs Confirmation

1. What exactly does `wish("#mentionable")` return? Is it all charms in the space?
2. Are there other special wish paths besides `"#mentionable"` and `"#recent"`?
3. Is there a way to filter which charms appear in the @ mention suggestions?
4. Does the `.equals()` method work reliably for all OpaqueRef types?

## Known Issues (2025-11-22)

**@ Mention feature not working**: The implementation above compiles and deploys successfully, but @ mentions do not work in practice:

**What was tested:**
- Typing "@" in ct-prompt-input - no dropdown appears
- Typing "[[" (wiki-link syntax) - no dropdown appears
- Manually typing "[[Mashed Potatoes]]" and clicking Send - handler does not fire, no console events
- Recipe count stays at 0, no changes detected

**Technical details:**
- Pattern: meal-orchestrator.tsx deployed to test-meal-v3
- Test recipe: "🍳 Mashed Potatoes" confirmed present in same space
- No errors in console
- No handler events firing (checked console logs)
- Input field renders and accepts text normally

**Additional testing (2025-11-22):**
- Added `schemaifyWish` helper function to match chatbot.tsx implementation
- Changed from `wish<any[]>("#mentionable")` to `schemaifyWish<any[]>("#mentionable")`
- Redeployed and tested typing "@mashed" - still no dropdown appears
- Confirmed chatbot.tsx uses identical pattern but works correctly

**ROOT CAUSE FOUND (2025-11-22 evening):**

The issue is NOT with the pattern implementation - it's with the space setup!

**The Problem:** `wish("#mentionable")` returns an empty array because the space does not have a BacklinksIndex pattern configured.

**How @ mentions work:**
1. `wish("#mentionable")` resolves to `space.defaultPattern.backlinksIndex.mentionable`
2. The BacklinksIndex pattern (from `backlinks-index.tsx`) populates this list
3. Without BacklinksIndex, the mentionable array is empty, so no dropdown appears

**The Solution:** The space needs a BacklinksIndex pattern instance. This is typically created automatically in production spaces but was missing in our `test-meal-v3` development space.

**Evidence:**
- Browser console inspection: `promptInput.mentionable.get()` returned empty array (length: 0)
- Checked `wish.ts` source: `#mentionable` maps to `["defaultPattern", "backlinksIndex", "mentionable"]`
- Both chatbot.tsx and meal-orchestrator patterns are correctly implemented
- The @ mention UI code works perfectly - it just has no data to show

**How to Fix:**

The BacklinksIndex pattern should be automatically created in production spaces. For development/testing:

1. Check if BacklinksIndex exists in your space
2. If missing, create an instance of the BacklinksIndex pattern
3. Set it as `defaultPattern.backlinksIndex` in your space configuration

Note: This is usually handled automatically by the framework in production environments. The issue primarily affects development/test spaces that were created without proper initialization.

## Related Patterns

- `note.tsx` - Full implementation with backlinks
- `chatbot.tsx` - Implementation with LLM context
- `meal-orchestrator.tsx` - Implementation for recipe references
