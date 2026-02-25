# CustomEvent.detail is Undefined Across ct-render Boundaries

**Date:** 2026-02-10
**Status:** superstition
**Confidence:** medium
**Stars:** 4

## TL;DR - The Rule

**Never rely on `event.detail` from custom events in ct-render handlers.** When embedding a sub-recipe via `<ct-render $cell={subRecipe} />`, custom events like `onct-select`, `onct-input`, etc. have their `event.detail` as `undefined`. Standard events like `onClick` work fine.

```tsx
// BROKEN - event.detail is undefined across ct-render boundary
<ct-render
  $cell={subRecipeOutput}
  onct-select={(event) => {
    console.log(event.detail);  // undefined!
  }}
/>

// WORKAROUND - Use $value binding with multiple mode instead
<ct-autocomplete
  items={autocompleteItems}
  placeholder="Add a tag..."
  allowCustom
  multiple
  $value={tags}
/>
```

---

## Summary

When using `<ct-render $cell={subRecipe} />` to embed a sub-recipe, custom events (like `onct-select`, `onct-input`, `onct-change`) have their `event.detail` property as `undefined`, while standard HTML events like `onClick`, `onchange` work fine.

The root cause appears to be that the worker-side renderer, which executes sub-recipes in a separate execution context, doesn't properly reconstruct the `CustomEvent.detail` object when events cross the worker boundary. Standard DOM events serialize/deserialize correctly, but CustomEvent.detail (a user-defined data object) gets lost in transit.

## Why This Happens

The sub-recipe executes in a worker context separate from the main thread. When events fire:

1. **Standard events** (`onClick`, `onchange`) work because their properties are part of the core DOM event contract and serialize cleanly
2. **Custom events** (`onct-*`) fail because `CustomEvent.detail` is an arbitrary JavaScript object that doesn't survive the worker-to-main-thread serialization boundary

The pattern framework's event forwarding logic appears to reconstruct events without preserving the `.detail` payload.

## Symptoms

- `event.detail === undefined` in ct-render custom event handlers
- `TypeError: Cannot read properties of undefined (reading 'value')` when accessing `event.detail.value`
- Standard events (`onClick`) work correctly in the same context
- No error at compile time - fails silently at runtime

## The Problematic Pattern

This breaks when trying to handle custom events from embedded sub-recipes:

```tsx
// Parent pattern embedding a sub-recipe with autocomplete
const tagPickerOutput = TagPicker({ items: availableTags });

return {
  [UI]: (
    <ct-render
      $cell={tagPickerOutput}
      onct-select={(event) => {
        // BROKEN: event.detail is undefined
        const selectedValue = event.detail.value;  // TypeError!
        tags.push(selectedValue);
      }}
    />
  ),
};
```

## Correct Patterns

### Option 1: Use $value Binding (Preferred)

For ct-autocomplete and similar components, use bidirectional binding instead of event handlers:

```tsx
// In the sub-recipe
<ct-autocomplete
  items={autocompleteItems}
  placeholder="Add a tag..."
  allowCustom
  multiple
  $value={tags}  // Bidirectional binding - updates tags directly
/>
```

### Option 2: Expose Selection in Sub-Recipe Output

If the sub-recipe needs to communicate selection back to parent:

```tsx
// Sub-recipe output interface
interface TagPickerOutput {
  [UI]: unknown;
  selectedTag: Cell<string | null>;  // Selection exposed in output
}

// Parent reads from output instead of event
{derive(tagPickerOutput.selectedTag, (tag) => (
  tag ? <div>Selected: {tag}</div> : null
))}
```

### Option 3: Use Standard Events Where Possible

Standard events work fine - structure sub-recipes to use them when possible:

```tsx
// Sub-recipe using onClick (works!)
<button onClick={onSelectItem({ item })}>
  {item.name}
</button>
```

## Real-World Example

**Pattern:** Folksonomy Tags (sub-recipe for tagging UI)
**Bug:** `onct-select` handler received undefined event when trying to add tags

### Before (Broken)

```tsx
// In folksonomy-tags.tsx sub-recipe
const onSelectTag = handler<CustomEvent, { tags: Writable<string[]> }>(
  (event, { tags }) => {
    const selected = event.detail?.value;  // event is undefined!
    if (selected) tags.push(selected);
  }
);

// In recipe return
<ct-autocomplete
  items={autocompleteItems}
  onct-select={onSelectTag({ tags })}
/>
```

**Result:** Handler received undefined event, tags never added.

### After (Fixed)

```tsx
// Use $value binding instead of event handler
<ct-autocomplete
  items={autocompleteItems}
  placeholder="Add a tag..."
  allowCustom
  multiple
  $value={tags}
/>
```

**Result:** Tags add/remove correctly via bidirectional binding.

## Differentiating from Related Issues

| Issue | Symptom | Root Cause |
|-------|---------|------------|
| **This issue** | `event.detail === undefined` in ct-render | Worker boundary loses CustomEvent.detail |
| Handler state undefined | Handler state vars are undefined | Non-Writable cells passed to handler state |
| Handler binding in .map() | "Handler used as lift" error | Direct binding required, not arrow functions |
| Standard events not firing | onClick doesn't trigger | Event handler syntax or binding issue |

## Key Rules

1. **Never rely on `event.detail` from custom events across ct-render boundaries**
2. **Use `$value` binding** for components that support it (ct-autocomplete, ct-input)
3. **Expose data in sub-recipe output** instead of relying on event details
4. **Standard events work** - use `onClick`, `onchange` when possible
5. **Test event handlers in sub-recipes** - they may fail silently

## Related Superstitions

- `2026-01-19-handlers-writable-wrapper-on-default-types.md` - Handler binding patterns
- `2026-01-15-reactive-refs-from-map-to-handlers.md` - Event values as Cell refs

## Metadata

```yaml
topic: events, custom-events, ct-render, worker-rendering, jsx
discovered: 2026-02-10
confirmed_count: 1
last_confirmed: 2026-02-10
sessions: [community-wisdom-tag-list]
related_functions: handler, ct-render
pattern: packages/patterns/experimental/folksonomy-tags.tsx
status: superstition
confidence: medium
stars: 4
applies_to: [CommonTools]
```

## Guestbook

- 2026-02-10 - Discovered while implementing folksonomy-tags sub-recipe with ct-autocomplete. The `onct-select` handler received `undefined` for the event parameter, preventing access to selected tag value. Standard events like `onClick` worked fine in the same pattern. Root cause: Worker-side renderer doesn't properly reconstruct CustomEvent.detail when events cross the ct-render boundary. Fixed by switching from `onct-select={handler}` to `$value={tags}` with `multiple` mode for bidirectional binding. (community-wisdom-tag-list)

---

**Remember:** CustomEvent.detail doesn't cross ct-render worker boundaries cleanly. Use `$value` binding or pattern output for data flow instead of relying on custom event details.
