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

**Conclusion:** This implementation approach may not be correct, or ct-prompt-input $mentionable requires additional undocumented setup. Recommend consulting framework authors for guidance on proper @ mention/wikilink implementation.

**Alternative approaches to try:**
- Use ct-code-editor instead of ct-prompt-input (note.tsx uses this)
- Check if there's a specific event format or setup needed
- Investigate if mentions need to be parsed from text manually

## Related Patterns

- `note.tsx` - Full implementation with backlinks
- `chatbot.tsx` - Implementation with LLM context
- `meal-orchestrator.tsx` - Implementation for recipe references
