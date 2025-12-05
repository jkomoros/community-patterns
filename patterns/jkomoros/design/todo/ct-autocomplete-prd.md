# PRD: ct-autocomplete Built-in Component

**Status:** In Progress
**Priority:** High
**Branch (labs):** `feature/ct-autocomplete`
**Branch (community-patterns):** `feature/ct-autocomplete`
**Prototype:** `patterns/jkomoros/components/search-select-prototype.tsx`

## Problem Statement

When patterns need to select from large predefined lists (40+ options like relationship types), a standard dropdown is unwieldy. Users need:
1. Quick search/filter to find options
2. Keyboard navigation (arrow keys + Enter)
3. Optional free-form entry for items not in the list

A user-land pattern prototype was built but hit framework limitations:
- Visual highlight doesn't update reactively inside `.map()` (see `ISSUE-Map-Style-Reactivity.md`)
- Cannot use `getBoundingClientRect()` for dynamic dropdown positioning
- Cannot programmatically focus elements

## Design Decision: Decomposed Architecture

**Previous approach (rejected):** A monolithic `ct-search-select` that combined autocomplete + tag display + multi-select wiring.

**New approach:** Two separate concerns:

1. **`ct-autocomplete`** (built-in) - Search input + filterable dropdown. Outputs single selection.
2. **`tag-selector`** (userland pattern) - Displays selected items as chips, wires to `ct-autocomplete` for adding.

This decomposition is better because:
- More composable - use `ct-autocomplete` alone for single-select
- Simpler built-in component - one job done well
- Userland can customize tag display without framework changes
- Easier to test each piece independently

## ct-autocomplete Component API

```typescript
<ct-autocomplete
  // Items to choose from (static list - v1)
  items={[
    { value: "colleague", label: "Colleague", group: "Professional" },
    { value: "friend", label: "Friend", group: "Personal" },
    // ...
  ]}

  // Emits selected item (not bidirectional - just output)
  onselect={(item) => handleSelection(item)}

  // Optional configuration
  placeholder="Search..."
  maxVisible={8}              // Max items to show in dropdown
  allowCustom={false}         // If true, user can enter free-form text
/>
```

### Item Format

```typescript
interface AutocompleteItem {
  value: string;              // Returned when selected
  label?: string;             // Display text (defaults to value)
  group?: string;             // Category for grouping/disambiguation
  searchAliases?: string[];   // Additional search terms (v1 - include)
}
```

### Search Aliases

Enables matching items by related terms not in the display label:
- "sibling" matches when user types "sister" or "brother"
- "colleague" matches when user types "coworker"

```typescript
{
  value: "sibling",
  label: "Sibling",
  group: "Family",
  searchAliases: ["sister", "brother", "bro", "sis"],
}
```

## Visual Design

### Collapsed State (Input Focused)

```
┌─────────────────────────────────────────┐
│ 🔍 [Search or type to add...]           │
└─────────────────────────────────────────┘
```

### Expanded State (Dropdown Open)

```
┌─────────────────────────────────────────┐
│ 🔍 [man                              ]  │
├─────────────────────────────────────────┤
│ ▸ Manager              Professional     │  ← highlighted
│   Mentor               Professional     │
└─────────────────────────────────────────┘
```

- Search input at top
- Options list filtered by search query
- Group shown as smaller text on right
- Visual highlight for keyboard navigation
- Click anywhere outside to close

### With allowCustom={true}

```
┌─────────────────────────────────────────┐
│ 🔍 [custom value                     ]  │
├─────────────────────────────────────────┤
│ ▸ Add "custom value"                    │  ← shown when no matches
└─────────────────────────────────────────┘
```

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `↓` / `↑` | Move highlight through options |
| `Enter` | Select highlighted option (or custom value if allowCustom) |
| `Escape` | Close dropdown, clear input |
| `Tab` | Close dropdown, move focus |

## Events

| Event | Detail | When |
|-------|--------|------|
| `ct-select` | `{ value, label, group?, isCustom }` | Item selected |
| `ct-open` | `{}` | Dropdown opened |
| `ct-close` | `{}` | Dropdown closed |

## Implementation Notes

### Why Built-in Component?

A built-in component has access to:
1. **DOM APIs** - `getBoundingClientRect()` for smart dropdown positioning
2. **Focus management** - Programmatic focus on input
3. **Direct style updates** - No reactivity issues with highlight state
4. **Event handling** - Native keyboard events without framework wrapping

### Positioning Strategy

1. Default: Below the input
2. If not enough space below: Flip to above
3. If near horizontal edge: Shift to stay in viewport
4. Use `position: fixed` with calculated coordinates

### Accessibility

- `role="combobox"` on input container
- `role="listbox"` on dropdown
- `role="option"` on each item
- `aria-expanded` for dropdown state
- `aria-activedescendant` for keyboard highlight
- `aria-autocomplete="list"` (or `"both"` if allowCustom)

## Scope: v1 vs Future

### v1 (This PR)
- [x] Static items list
- [x] Client-side filtering
- [x] Keyboard navigation
- [x] Smart positioning
- [x] `allowCustom` for free-form entry
- [x] `searchAliases` support
- [x] Accessibility basics

### Future (Not in v1)
- [ ] Async/streaming items (server-side search)
- [ ] Virtualized list for 1000+ items
- [ ] Custom item rendering (slots)
- [ ] Multiple selection mode built-in

## Test Cases

1. **Basic selection**: Click item, fires `ct-select` event
2. **Search filter**: Typing filters options by label, value, group, aliases
3. **Keyboard navigation**: Arrow keys move highlight, Enter selects
4. **Escape closes**: Pressing Escape closes dropdown
5. **Click outside closes**: Clicking anywhere else closes dropdown
6. **Custom value**: With `allowCustom`, Enter on non-matching text creates custom item
7. **Empty state**: "No matching options" when filter has no results
8. **Positioning**: Dropdown flips above when near bottom of viewport

## Userland tag-selector Pattern

The userland pattern wires `ct-autocomplete` to a chip display:

```tsx
// patterns/jkomoros/WIP/tag-selector.tsx
const TagSelector = ({ items, $selected }) => {
  const addItem = (item) => {
    if (!selected.get().includes(item.value)) {
      selected.set([...selected.get(), item.value]);
    }
  };

  const removeItem = (value) => {
    selected.set(selected.get().filter(v => v !== value));
  };

  return (
    <div>
      {/* Display selected as chips */}
      {selected.map(value => (
        <span class="chip">
          {items.find(i => i.value === value)?.label || value}
          <button onclick={() => removeItem(value)}>×</button>
        </span>
      ))}

      {/* Autocomplete for adding */}
      <ct-autocomplete
        items={items.filter(i => !selected.get().includes(i.value))}
        onselect={addItem}
        placeholder="+ Add..."
      />
    </div>
  );
};
```

## Implementation Path

1. ✅ Create feature branches (labs + community-patterns)
2. ⬜ Scaffold `ct-autocomplete` component in `labs/packages/ui/src/v2/components/`
3. ⬜ Implement core rendering (input + dropdown)
4. ⬜ Implement filtering logic with searchAliases
5. ⬜ Implement keyboard navigation
6. ⬜ Implement dropdown positioning
7. ⬜ Add `allowCustom` support
8. ⬜ Register component and add JSX types
9. ⬜ Create userland `tag-selector` pattern
10. ⬜ Test with Playwright
11. ⬜ PR to labs

## Related Files

- **Old PRD**: `patterns/jkomoros/design/todo/ct-search-select-prd.md` (superseded)
- **Prototype**: `patterns/jkomoros/components/search-select-prototype.tsx`
- **Issue**: `patterns/jkomoros/issues/ISSUE-Map-Style-Reactivity.md`

---

**Created:** 2025-12-05
**Updated:** 2025-12-05
**Author:** jkomoros (via Claude)
