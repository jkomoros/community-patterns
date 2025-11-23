# ct-code-editor Uses Wiki-Link Syntax [[, Not @ for Mentions

**Date:** 2025-11-22
**Author:** jkomoros
**Component:** ct-code-editor
**Status:** Superstition (needs confirmation)

## Problem

When using `ct-code-editor` for @ mentions / backlinks, typing "@" does not trigger the completions dropdown.

## Solution

ct-code-editor uses **wiki-link syntax** `[[` (double square brackets), not "@" for triggering completions.

### Working Example

```typescript
<ct-code-editor
  $value={inputText}
  $mentionable={mentionable}
  $mentioned={mentioned}
  onbacklink-create={handleBacklinkCreate({ items })}
  placeholder="@ mention items to add them..."
  language="text/markdown"
  theme="light"
  wordWrap
/>
```

**To trigger completions:**
1. Type `[[` (two opening square brackets)
2. Completions dropdown appears with mentionable items
3. Select an item or continue typing to filter
4. Press Enter to insert the wiki link

**Result:** `[[Item Name(charm-id)]]`

## Testing Observations

**Test date:** 2025-11-22
**Pattern:** meal-orchestrator.tsx in test-meal-v3 space

1. Typed `@` → No dropdown appeared ❌
2. Typed `[[` → Dropdown with 8 mentionable items appeared ✓
3. Selected "🍳 Mashed Potatoes" → Link inserted: `[[🍳 Mashed Potatoes(baedreiajkspjaadawhjxigtgu2etvm6hsmmyjez2ifguejrtv5nxmmueuq)]]` ✓

## Key Points

- **ct-code-editor uses `[[` for completions**, not `@`
- **ct-prompt-input uses `@` for mentions** (different component, different syntax)
- Both require `$mentionable` prop with `wish("#mentionable")`
- Both require page refresh after pattern creation for mentionable list to populate
- The placeholder text can say "@ mention" but actual trigger is `[[`

## Comparison with ct-prompt-input

| Component | Trigger | Output | Use Case |
|-----------|---------|--------|----------|
| ct-code-editor | `[[` | Wiki link with charm ID | Text editing, markdown, backlinks |
| ct-prompt-input | `@` | Markdown link | LLM prompts, chat messages |

## onbacklink-create Event

**Note:** The `onbacklink-create` event should fire when the wiki link is created, providing:
```typescript
{
  detail: {
    charm: Cell<any>;      // The referenced charm as a Cell
    navigate: boolean;     // Whether user wants to navigate to it
    text: string;          // The display text
    charmId: any;          // The charm ID
  }
}
```

**Testing observation:** In initial test, typing `[[` and selecting an item inserted the wiki link text, but the count didn't update immediately, suggesting the event may fire asynchronously or require additional user action.

## Related Patterns

- `note.tsx` - Uses ct-code-editor with wiki-link syntax
- `chatbot.tsx` - Uses ct-prompt-input with @ syntax
- `meal-orchestrator.tsx` - Uses ct-code-editor with wiki-link syntax

## Questions / Needs Confirmation

1. Does `onbacklink-create` fire when the wiki link is inserted, or when it's "completed" (e.g., clicking outside)?
2. Is there a way to customize the trigger characters for ct-code-editor?
3. Should placeholder text say "Type [[ to mention" instead of "@ mention" to avoid confusion?
4. Can ct-code-editor support both `[[` and `@` triggers simultaneously?
