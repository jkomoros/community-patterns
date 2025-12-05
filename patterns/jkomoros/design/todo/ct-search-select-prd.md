# PRD: ct-search-select Built-in Component

**Status:** TODO - Waiting for implementation
**Priority:** Medium
**Prototype:** `patterns/jkomoros/components/search-select-prototype.tsx`

## Problem Statement

When patterns need to select from large predefined lists (40+ options like relationship types), displaying all options as buttons is overwhelming. Users need:
1. A compact default view showing current selections
2. Quick search/filter to find options
3. Easy add/remove with multi-select support
4. Full keyboard navigation (arrow keys + Enter)

A user-land pattern prototype was built but hit framework limitations:
- Visual highlight doesn't update reactively inside `.map()` (see `ISSUE-Map-Style-Reactivity.md`)
- Cannot use `getBoundingClientRect()` for dynamic dropdown positioning
- Cannot programmatically focus elements

## Proposed Solution

A built-in `ct-search-select` component with full DOM access.

## Component API

```typescript
<ct-search-select
  // Items to choose from
  items={[
    { value: "colleague", label: "Colleague", group: "Professional" },
    { value: "friend", label: "Friend", group: "Personal" },
    // ...
  ]}

  // Currently selected values (bidirectional binding)
  $selected={selectedValuesCell}

  // Optional configuration
  placeholder="Search..."
  maxVisible={8}              // Max items to show in dropdown
  groupBy="group"             // Group items by this property
/>
```

### Item Format

```typescript
interface SearchSelectItem {
  value: string;              // Stored in selected array
  label?: string;             // Display text (defaults to value)
  group?: string;             // Category for grouping/disambiguation
  searchAliases?: string[];   // Additional search terms (future)
}
```

## Visual Design

### Collapsed State (Default)

```
┌─────────────────────────────────────────────────────────────┐
│ [Colleague ×] [Friend ×] [+ Add]                            │
└─────────────────────────────────────────────────────────────┘
```

- Selected items shown as pills/chips with × remove button
- "+ Add" button to open dropdown

### Expanded State (Dropdown Open)

```
┌─────────────────────────────────────────────────────────────┐
│ [Colleague ×] [Friend ×] [+ Add]                            │
│                         ┌───────────────────────┐           │
│                         │🔍 [search...        ] │           │
│                         │ Manager    Professional│ ← highlight
│                         │ Mentor     Professional│           │
│                         │ Parent         Family  │           │
│                         │ Sibling        Family  │           │
│                         └───────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

- Search input at top with autofocus
- Options list filtered by search query
- Group/category shown as smaller text on right
- Visual highlight for keyboard navigation
- Click anywhere outside to close

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `↓` / `↑` | Move highlight through options |
| `Enter` | Select highlighted option |
| `Escape` | Close dropdown |
| `Backspace` (empty input) | Remove last selected item |

## Implementation Notes

### Why Built-in Component?

A built-in component has access to:
1. **DOM APIs** - `getBoundingClientRect()` for smart dropdown positioning
2. **Focus management** - Programmatic focus on search input
3. **Direct style updates** - No reactivity issues with highlight state
4. **Event handling** - Native keyboard events without framework wrapping

### Positioning Strategy

1. Default: Below the "+ Add" button
2. If not enough space below: Flip to above
3. If near edge: Shift horizontally to stay in viewport
4. Use `position: fixed` with calculated coordinates

### Accessibility

- `role="combobox"` on container
- `role="listbox"` on options list
- `role="option"` on each item
- `aria-selected` for current selection
- `aria-activedescendant` for keyboard highlight
- Focus trap when dropdown is open

## Test Cases

1. **Basic selection**: Click item to select, shows as chip
2. **Remove selection**: Click × on chip removes it
3. **Search filter**: Typing filters options by label, value, and group
4. **Keyboard navigation**: Arrow keys move highlight, Enter selects
5. **Escape closes**: Pressing Escape closes dropdown
6. **Click outside closes**: Clicking backdrop closes dropdown
7. **No duplicates**: Already-selected items hidden from dropdown
8. **Empty state**: "No matching options" when filter has no results
9. **Bidirectional binding**: External changes to `$selected` update UI

## Related Files

- **Prototype**: `patterns/jkomoros/components/search-select-prototype.tsx`
- **Design doc**: `patterns/jkomoros/design/todo/search-select-component.md`
- **Issue**: `patterns/jkomoros/issues/ISSUE-Map-Style-Reactivity.md`
- **Test pattern**: `patterns/jkomoros/search-select-test.tsx`

## Implementation Path

1. Review this PRD with framework team
2. Add to `labs/packages/shell/src/components/` as `ct-search-select.tsx`
3. Register in component registry
4. Add TypeScript types for JSX
5. Write tests
6. Update `person.tsx` to use new component
7. Archive prototype

## Open Questions

1. Should `searchAliases` be in v1 or defer to v2?
2. Should there be a `disabled` state?
3. Should we support custom item rendering (slots)?
4. Should there be a `max` limit on selections?
5. Should we emit events (`onchange`, `onopen`, `onclose`)?

---

**Created:** 2025-12-05
**Author:** jkomoros (via Claude)
