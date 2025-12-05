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
2. [x] Create `search-select.tsx` in `patterns/jkomoros/lib/`
3. [x] Implement core pattern with:
   - Selected chips display
   - Add button with dropdown
   - Search input filtering
   - Option selection
4. [x] Test in isolation with test data (`search-select-test.tsx`)
5. [ ] Integrate into person.tsx for relationship types
6. [ ] Iterate based on usage

---

## Implementation Notes

**Key discoveries during implementation:**

1. **Cell unwrapping in derive()**: Even with array syntax `derive([cell], ([val]) => ...)`, values may come through as Cell objects. Added `safeUnwrap()` helper function to defensively handle this.

2. **Maps don't serialize well**: Using `new Map()` in derive outputs caused "get is not a function" errors. Switched to plain `Record<string, T>` objects which serialize correctly.

3. **safeUnwrap must exclude Map/Set**: Initial safeUnwrap checked for `.get()` method, which incorrectly matched Maps. Fixed by checking for `.set()` also AND `!(v instanceof Map)`.

4. **Test pattern location**: Moved test from `WIP/` to same level as `lib/` because relative imports like `../lib/search-select.tsx` weren't resolving correctly from WIP.

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
- 2025-12-04: All core functionality working and tested.
