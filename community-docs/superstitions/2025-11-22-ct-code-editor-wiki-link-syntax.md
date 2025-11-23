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

### Initial Test (2025-11-22 morning)
**Pattern:** meal-orchestrator.tsx in test-meal-v3 space

1. Typed `@` → No dropdown appeared ❌
2. Typed `[[` → Dropdown with 8 mentionable items appeared ✓
3. Selected "🍳 Mashed Potatoes" → Link inserted: `[[🍳 Mashed Potatoes(baedreiajkspjaadawhjxigtgu2etvm6hsmmyjez2ifguejrtv5nxmmueuq)]]` ✓

### Comprehensive Test (2025-11-22 evening)
**Pattern:** meal-orchestrator.tsx in test-meal-handler space
**Charm ID:** baedreidwyh6jagmjmpfd6auxkf5vs2kguzojr6ovaepqm3hzvp6wbsles4

**`[[` Syntax: ✅ WORKS**
1. Typed `[[` → Completions dropdown appeared immediately ✓
2. Dropdown showed 2 items: "🍽️ Untitled Meal" and "DefaultCharmList (2)" ✓
3. Selected item → Wiki link inserted: `[[🍽️ Untitled Meal(baedreidwyh6jagmjmpfd6auxkf5vs2kguzojr6ovaepqm3hzvp6wbsles4)]]` ✓

**`onbacklink-create` Handler: ❌ DOES NOT FIRE**
1. Handler added with console.log statement ✓
2. Wiki link inserted via dropdown ✓
3. No console.log output - handler did NOT fire ❌
4. Counter stayed at "Recipes (0)" - no state update ❌
5. Clicked outside editor to blur - still no handler execution ❌

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

**Expected signature:**
```typescript
{
  detail: {
    text: string;          // The display text
    charmId: any;          // The charm ID
    charm: Cell<any>;      // The referenced charm as a Cell
    navigate: boolean;     // Whether user wants to navigate to it
  }
}
```

**⚠️ CRITICAL FINDING:** The `onbacklink-create` event **does NOT fire** when wiki links are inserted via the completions dropdown.

**Evidence:**
- Handler with console.log added to pattern ✓
- Wiki link successfully inserted into editor ✓
- No console output when link created ❌
- No state updates triggered ❌
- Blurring editor doesn't trigger handler ❌

**Hypothesis:** The event may only fire when:
- User clicks on an existing wiki link in the editor
- User performs some other action (Cmd+Click, etc.)
- A different event type is needed for dropdown selections

**Working reference:** `note.tsx` uses identical handler signature and bindings, but may have different usage pattern.

## Related Patterns

- `note.tsx` - Uses ct-code-editor with wiki-link syntax
- `chatbot.tsx` - Uses ct-prompt-input with @ syntax
- `meal-orchestrator.tsx` - Uses ct-code-editor with wiki-link syntax

## Questions / Needs Confirmation

1. **When does `onbacklink-create` actually fire?** Not on dropdown selection. On click? On some other action?
2. **Is there a different event for dropdown completions?** Maybe `onchange` or a custom event?
3. **How does `note.tsx` actually use the handler?** Does it work differently than expected?
4. **Should we parse wiki links from `$value` changes instead?** Would that be more reliable?
5. Is there a way to customize the trigger characters for ct-code-editor?
6. Should placeholder text say "Type [[ to mention" instead of "@ mention" to avoid confusion?
7. Can ct-code-editor support both `[[` and `@` triggers simultaneously?
