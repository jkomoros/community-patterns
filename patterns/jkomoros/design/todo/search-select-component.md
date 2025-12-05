# Search-to-Select Pattern Component

## Overview

A user-land pattern that provides search-to-select functionality for choosing items from a predefined list. Designed to be instantiated inline within other patterns.

## Problem

When you have a large predefined list of options (like 40+ relationship types), displaying all options as buttons is overwhelming. Users need a way to:
1. See what's currently selected (compact view)
2. Quickly find and add items via search
3. Remove items easily

## Design Goals

1. **Inline composable** - Instantiate within other patterns
2. **Compact by default** - Shows only selected items + add button
3. **Search-driven** - Type to filter available options
4. **Multi-select** - Can select multiple items
5. **Reactive** - Selected items cell updates parent pattern

---

## Design Decisions (2025-12-04)

### Q1: Option Data Structure ✅ DECIDED

**Format:** `string | SearchSelectItem`

```typescript
interface SearchSelectItem {
  value: string;      // The actual value stored
  label?: string;     // Display label (defaults to value)
  group?: string;     // Category label shown smaller to disambiguate
}

// Strings are shorthand - "colleague" becomes { value: "colleague", label: "colleague" }
```

**Naming:** Following ct-select convention, use `items` prop name.

### Q2: Display of Selected Items ✅ DECIDED

**Inline chips with remove button:**
```
[Colleague ×] [Friend ×] [+ Add]
```

### Q3: Search UI Behavior ✅ DECIDED

**Dropdown appears below Add button:**
```
[Colleague ×] [Friend ×] [+ Add]
                         ┌─────────────────────────┐
                         │ 🔍 [search...          ]│
                         │ Manager      Professional│
                         │ Mentor       Professional│
                         │ Parent           Family  │
                         └─────────────────────────┘
```

Category/group label shown on right side in smaller text.

### Q4: Pattern Interface ✅ DECIDED

**Direct bidirectional binding with object-only items:**

```typescript
const relationshipTypes = cell<string[]>([]);

const selector = SearchSelect({
  items: RELATIONSHIP_TYPE_ITEMS,  // SearchSelectItem[]
  selected: relationshipTypes,     // bidirectional Cell<string[]>
  placeholder: "Add relationship type...",
});

// In UI
{selector}
```

### Q5: Categories ✅ DECIDED

Each item can have `group?: string` which displays as smaller text on the right to disambiguate items with similar names.

---

## Final Design

### Types
```typescript
// Item in the options list
interface SearchSelectItem {
  value: string;      // The actual value stored in selected array
  label?: string;     // Display label (defaults to value if not provided)
  group?: string;     // Category shown as smaller text to disambiguate
}

// Normalized item (always has label)
interface NormalizedItem {
  value: string;
  label: string;
  group?: string;
}
```

### Input Schema
```typescript
interface SearchSelectInput {
  // The full list of available options
  items: Default<SearchSelectItem[], []>;

  // Currently selected values (bidirectional Cell)
  selected: Cell<string[]>;

  // UI configuration
  placeholder?: Default<string, "Search...">;
  maxVisible?: Default<number, 8>;  // Max filtered results to show
}
```

### Output Schema
```typescript
interface SearchSelectOutput {
  // The selected values (same cell as input for bidirectional)
  selected: Cell<string[]>;

  // UI to render
  [UI]: JSX;
}
```

### Internal State
```typescript
// Local cells for UI state
const searchQuery = cell("");
const isOpen = cell(false);

// Normalize items (ensure all have labels)
const normalizedItems = derive([items], ([itemList]) =>
  itemList.map(item => ({
    value: item.value,
    label: item.label ?? item.value,
    group: item.group,
  }))
);

// Build lookup map for display
const itemMap = derive([normalizedItems], ([items]) =>
  new Map(items.map(item => [item.value, item]))
);

// Derived: available options (not selected)
const availableItems = derive([normalizedItems, selected], ([items, sel]) =>
  items.filter(item => !sel.includes(item.value))
);

// Derived: filtered options based on search
const filteredItems = derive([searchQuery, availableItems, maxVisible], ([query, available, max]) => {
  if (!query.trim()) return available.slice(0, max);
  const q = query.toLowerCase();
  return available
    .filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.value.toLowerCase().includes(q) ||
      (item.group?.toLowerCase().includes(q) ?? false)
    )
    .slice(0, max);
});
```

### UI Structure
```
┌─────────────────────────────────────────────────────────────┐
│ [Colleague ×] [Friend ×] [+ Add]                            │
│                                   ┌───────────────────────┐ │
│                                   │🔍 [search...        ] │ │
│                                   │ Manager    Professional│ │
│                                   │ Mentor     Professional│ │
│                                   │ Parent         Family  │ │
│                                   │ Sibling        Family  │ │
│                                   └───────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Handler Logic
```typescript
// Add item to selected
const addItem = handler<{ value: string }, { selected: Cell<string[]> }>(
  ({ value }, { selected }) => {
    const current = selected.get();
    if (!current.includes(value)) {
      selected.set([...current, value]);
    }
  }
);

// Remove item from selected
const removeItem = handler<{ value: string }, { selected: Cell<string[]> }>(
  ({ value }, { selected }) => {
    const current = selected.get();
    selected.set(current.filter(v => v !== value));
  }
);

// Toggle dropdown open/closed
const toggleOpen = handler<Record<string, never>, { isOpen: Cell<boolean> }>(
  (_, { isOpen }) => {
    isOpen.set(!isOpen.get());
  }
);

// Close dropdown
const closeDropdown = handler<Record<string, never>, { isOpen: Cell<boolean>, searchQuery: Cell<string> }>(
  (_, { isOpen, searchQuery }) => {
    isOpen.set(false);
    searchQuery.set("");
  }
);
```

---

## Implementation Plan

1. [x] Finalize design based on user input
2. [x] Create `search-select.tsx` in `patterns/jkomoros/components/`
3. [x] Implement core pattern with:
   - Selected chips display
   - Add button with dropdown
   - Search input filtering
   - Option selection
4. [x] Test in isolation with test data (`search-select-test.tsx`)
5. [x] Integrate into person.tsx for relationship types
6. [ ] Iterate based on usage

---

## Implementation Notes

**Key discoveries during implementation:**

1. **~~Cell unwrapping in derive()~~**: ~~Even with array syntax `derive([cell], ([val]) => ...)`, values may come through as Cell objects.~~ **CORRECTED (2025-12-05):** The array syntax was undocumented and shouldn't be used. Use `computed()` with explicit `.get()` calls instead.

2. **Maps don't serialize well**: Using `new Map()` in derive outputs caused "get is not a function" errors. Switched to plain `Record<string, T>` objects which serialize correctly.

3. **~~safeUnwrap helper~~**: **REMOVED (2025-12-05):** The `safeUnwrap()` helper was a workaround for using incorrect API. Not needed with proper `computed()` pattern.

4. **Test pattern location**: Moved test from `WIP/` to same level as `lib/` because relative imports like `../lib/search-select.tsx` weren't resolving correctly from WIP.

5. **Proper computed() pattern (2025-12-05)**: Inside `computed()`, cells do NOT auto-dereference. Always call `.get()` explicitly:
   ```typescript
   const availableItems = computed(() => {
     const sel = selected.get();  // Must call .get()
     return normalizedItems.filter((item) => !sel.includes(item.value));
   });
   ```

6. **Handlers cannot capture closures (2025-12-05)**: Pass values through handler state, not closure capture:
   ```typescript
   // WRONG: const createHandler = (value) => handler((_, state) => { ... });
   // CORRECT: const myHandler = handler((_, { selected, value }) => { ... });
   // USAGE: onClick={myHandler({ selected, value: item.value })}
   ```

7. **Cannot use reactive values as property keys (2025-12-05)**: Inside JSX `.map()`, items are opaque proxies. Using `lookup[item.value]` triggers `Symbol.toPrimitive` conversion which throws "Tried to directly access an opaque value". Pre-compute lookups inside `computed()` before the JSX.

8. **Use `ifElse()` for conditional rendering (2025-12-05)**: Do NOT use `computed(() => cond.get() ? jsx : null)` - the dropdown would appear briefly then disappear. Use `ifElse(conditionCell, thenJSX, elseJSX)` instead:
   ```typescript
   // WRONG: causes dropdown to flash and disappear
   {computed(() => isOpen.get() ? <div>...</div> : null)}

   // CORRECT: proper conditional rendering
   {ifElse(isOpen, <div>...</div>, null)}
   ```

9. **`ct-keybind` for keyboard shortcuts (2025-12-05)**: Use `ct-keybind` component for keyboard navigation:
   ```typescript
   <ct-keybind code="Escape" onct-keybind={closeHandler()} />
   <ct-keybind code="ArrowDown" ignore-editable={false} preventDefault onct-keybind={moveDownHandler()} />
   ```
   Note: `ignore-editable={false}` needed to capture keys while focused in a text input.

10. **`position: fixed` escapes parent overflow (2025-12-05)**: Parent containers have `overflow: hidden`. Using `position: absolute` causes clipping. Use `position: fixed` to escape, but coordinates must be hardcoded (no access to `getBoundingClientRect` in userland patterns).

11. **Visual highlight doesn't update reactively (2025-12-05)**: When using computed to add `isHighlighted` property to items, the internal state tracks correctly (keyboard selection works) but the CSS background doesn't re-render visually. The issue is that computed-generated plain objects inside `.map()` don't trigger style re-evaluation. This is a cosmetic limitation.

---

## Known Limitations (Userland Pattern)

1. **Dropdown position hardcoded** - Cannot use `getBoundingClientRect()` to dynamically position the dropdown relative to the button. Using `position: fixed` with hardcoded coordinates.

2. **Visual highlight doesn't update** - Internal `highlightedIndex` state works (keyboard selection selects the correct item), but the visual highlight background doesn't re-render when arrow keys are pressed.

3. **No programmatic focus** - Cannot call `element.focus()` from pattern code. The `autofocus` attribute works on initial render only.

These limitations could be resolved by implementing as a `ct-search-select` built-in component with full DOM access.

---

## Future Enhancements

1. **Alternate search text**: Allow items to have additional keywords for matching that don't display. Example: "sister" could match "sibling" even if there's no "sister" option.
   ```typescript
   interface SearchSelectItem {
     value: string;
     label?: string;
     group?: string;
     searchAliases?: string[];  // Additional search terms
   }
   ```

2. **Autofocus input**: When dropdown opens, auto-focus the search input. May require framework research for best practices.

3. **Dropdown positioning**: May need to handle cases where dropdown is clipped by parent overflow. Could require `position: fixed` with calculated coordinates or becoming a built-in component.

---

## Session Log

- 2025-12-04: Initial design doc created.
- 2025-12-04: User answered clarifying questions. Finalized design:
  - Items: `{ value, label?, group? }` format, following ct-select naming
  - Display: Inline chips with remove
  - Search: Dropdown below Add button
  - Interface: Direct bidirectional Cell binding
  - Groups: Shown as smaller disambiguating text on right
- 2025-12-04: Implemented search-select.tsx. Multiple iterations to fix:
  - Relative import paths from WIP/ subfolder
  - Cell unwrapping issues in derive callbacks
  - Map serialization issues (switched to Record<>)
  - isOpen state not defaulting to false
- 2025-12-04: Initial version working with safeUnwrap() workaround.
- 2025-12-05: **Major refactor** - Discovered `derive([array])` syntax is undocumented. Rewrote to use proper `computed()` pattern with explicit `.get()` calls. Removed all workarounds. Component now works correctly following framework conventions.
- 2025-12-05: **Added keyboard navigation and backdrop close**:
  - Added `ct-keybind` for Escape, ArrowUp, ArrowDown, Enter
  - Added invisible backdrop div for click-outside-to-close
  - Fixed dropdown clipping with `position: fixed` (hardcoded coordinates)
  - Keyboard selection works (selects correct item), but visual highlight doesn't update reactively
  - Documented known limitations of userland patterns vs built-in components
- 2025-12-05: **Confirmed visual highlight limitation**:
  - Tested with derive() approach - same result
  - Internal state updates correctly (ArrowDown then Enter selects index 1 = "Manager")
  - Visual highlight stays on index 0 ("Colleague") - JSX doesn't re-render
  - This is a framework limitation: derived values in `.map()` don't trigger style re-evaluation
  - **Component is FUNCTIONALLY COMPLETE** - keyboard nav works, only visual feedback is missing
