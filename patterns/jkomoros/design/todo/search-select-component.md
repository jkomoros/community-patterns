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

## Clarifying Questions

### Q1: Option Data Structure

What should the options look like?

**Option A: Simple strings**
```typescript
const options = ["colleague", "friend", "spouse", "parent"];
```

**Option B: Label + Value pairs**
```typescript
const options = [
  { label: "Colleague", value: "colleague" },
  { label: "Close Friend", value: "friend" },
];
```

**Option C: Grouped/Categorized**
```typescript
const options = {
  professional: ["colleague", "manager", "mentor"],
  personal: ["friend", "neighbor"],
  family: ["spouse", "parent", "sibling"],
};
```

### Q2: Display of Selected Items

How should selected items appear?

**Option A: Inline chips with remove button**
```
[Colleague ×] [Friend ×] [+ Add]
```

**Option B: Comma-separated text with edit button**
```
Colleague, Friend [Edit]
```

**Option C: Vertical list**
```
• Colleague [×]
• Friend [×]
[+ Add]
```

### Q3: Search UI Behavior

When user clicks "Add", what happens?

**Option A: Dropdown appears below**
```
[Colleague ×] [Friend ×] [+ Add]
                         ┌─────────────────┐
                         │ 🔍 [search...  ]│
                         │ Manager         │
                         │ Mentor          │
                         │ Parent          │
                         └─────────────────┘
```

**Option B: Inline expansion**
```
[Colleague ×] [Friend ×]
🔍 [search...         ]
  Manager | Mentor | Parent | ...
```

**Option C: Modal/overlay**
Full-screen or centered modal with search.

### Q4: Pattern Interface

How should the pattern be used in parent patterns?

**Option A: Direct composition**
```typescript
const relationshipTypes = cell<string[]>([]);

const selector = SearchSelect({
  options: RELATIONSHIP_TYPES,
  selected: relationshipTypes,  // bidirectional
  placeholder: "Add relationship type...",
});

// In UI
{selector}
```

**Option B: As a component with separate result cell**
```typescript
const selector = SearchSelect({
  options: RELATIONSHIP_TYPES,
  placeholder: "Add relationship type...",
});

// Read results from selector.selected
const types = selector.selected;

// In UI
{selector}
```

### Q5: Styling/Theming

**Option A: Minimal, inherit from parent**
Just functional, matches ct- component styles.

**Option B: Configurable**
Pass in style props for colors, sizes.

---

## Proposed Design (Pending Answers)

### Input Schema
```typescript
interface SearchSelectInput {
  // The full list of available options
  options: Default<string[], []>;

  // Optionally grouped options (if using categories)
  groupedOptions?: Record<string, string[]>;

  // Currently selected values (bidirectional)
  selected: Default<string[], []>;

  // UI configuration
  placeholder?: Default<string, "Search...">;
  maxVisible?: Default<number, 5>;  // Max filtered results to show
}
```

### Output Schema
```typescript
interface SearchSelectOutput {
  // The selected values (same cell as input for bidirectional)
  selected: string[];

  // UI to render
  [UI]: JSX;
}
```

### Internal State
```typescript
// Local cells for UI state
const searchQuery = cell("");
const isExpanded = cell(false);

// Derived: filtered options based on search
const filteredOptions = derive([searchQuery, options, selected], ([query, opts, sel]) => {
  const available = opts.filter(o => !sel.includes(o));
  if (!query) return available.slice(0, maxVisible);
  return available
    .filter(o => o.toLowerCase().includes(query.toLowerCase()))
    .slice(0, maxVisible);
});
```

### UI Structure
```
┌─────────────────────────────────────────────┐
│ Selected Tags Area                          │
│ [Tag1 ×] [Tag2 ×] [Tag3 ×] [+ Add]         │
│                                             │
│ ─ ─ ─ (when expanded) ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│                                             │
│ 🔍 [search query here...               ]   │
│                                             │
│ Filtered Options:                           │
│ [Option A] [Option B] [Option C]           │
│ [Option D] [Option E]                       │
└─────────────────────────────────────────────┘
```

---

## Implementation Plan

1. [ ] Finalize design based on answers to questions
2. [ ] Create `search-select.tsx` in `patterns/jkomoros/lib/`
3. [ ] Implement basic string array version
4. [ ] Test in isolation
5. [ ] Integrate into person.tsx for relationship types
6. [ ] Iterate based on usage

---

## Open Questions for User

1. **Option format**: Strings, label/value pairs, or grouped?
2. **Selected display**: Inline chips, comma text, or vertical list?
3. **Search UI**: Dropdown, inline expansion, or modal?
4. **Interface**: Direct composition or separate result cell?
5. **Categories**: Should search show category headers?

---

## Session Log

- 2025-12-04: Initial design doc created. Awaiting user input on clarifying questions.
