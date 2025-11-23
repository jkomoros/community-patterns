# Thinking Reactively vs Thinking in Terms of Events

**Date:** 2025-11-22
**Author:** jkomoros
**Status:** Folk Wisdom
**Pattern:** General pattern development philosophy

## Overview

CommonTools is fundamentally a **reactive framework**. Many developers coming from event-driven frameworks (React, Vue, etc.) instinctively reach for event handlers when they should be thinking reactively instead.

## The Core Principle

**React to data changes, not events.**

Instead of asking "when does X happen?", ask "what data changes when X happens, and how can I react to that?"

## Event-Based Thinking vs Reactive Thinking

### ❌ Event-Based Approach (Anti-Pattern)

```typescript
// Listen for events and manually update state
const addRecipeMention = handler<{ detail: { charm: Cell<any> } }, { recipes: Cell<any[]> }>(
  ({ detail }, { recipes }) => {
    const { charm } = detail;
    const currentRecipes = recipes.get();
    recipes.set([...currentRecipes, charm]);
  }
);

<ct-code-editor
  $value={inputText}
  $mentionable={mentionable}
  onbacklink-create={addRecipeMention({ recipes })}  // Event handler
/>
```

**Problems:**
- Requires manual state management
- Event may not fire when expected
- More code to maintain
- Harder to reason about data flow

### ✅ Reactive Approach (Idiomatic)

```typescript
// Let the component populate a cell, then react to it
const recipeMentioned = cell<any[]>([]);
const recipeCount = computed(() => recipeMentioned.get().length);

<ct-code-editor
  $value={inputText}
  $mentionable={mentionable}
  $mentioned={recipeMentioned}  // Reactive binding
/>

{/* Display count - updates automatically */}
<h3>Recipes ({recipeCount})</h3>

{/* Display list - updates automatically */}
{recipeMentioned.map((recipe) => (
  <div>{recipe.name}</div>
))}
```

**Benefits:**
- Component automatically updates the cell
- All dependent computations update reactively
- Less code, clearer intent
- Data flow is explicit

## When to Use Which Approach

### Use Reactive Bindings When:
- ✅ A component provides a reactive prop (like `$mentioned`, `$value`, `$checked`)
- ✅ You want to display or derive from the data
- ✅ Multiple parts of your UI depend on the same data
- ✅ You're reading data

### Use Event Handlers When:
- ✅ You need to perform side effects (API calls, navigation)
- ✅ You need to validate or transform user input before accepting it
- ✅ The action requires multiple state updates
- ✅ You're writing data in response to user actions

## Real-World Example: ct-code-editor Wiki Links

### The Problem

When implementing wiki-link functionality with ct-code-editor, the natural inclination is to use `onbacklink-create`:

```typescript
// ❌ Event-based approach - seems natural but problematic
<ct-code-editor
  $value={recipeInputText}
  $mentionable={mentionable}
  onbacklink-create={({ detail }, { recipes }) => {
    recipes.set([...recipes.get(), detail.charm]);
  }}
/>
```

**Issues encountered:**
- `onbacklink-create` doesn't fire when selecting from dropdown
- Only fires when clicking non-existent links
- Requires manual state management
- More code for deduplication

### The Solution

Use `$mentioned` reactive binding instead:

```typescript
// ✅ Reactive approach - clean and automatic
const recipeMentioned = cell<any[]>([]);
const recipeCount = computed(() => recipeMentioned.get().length);

<ct-code-editor
  $value={recipeInputText}
  $mentionable={mentionable}
  $mentioned={recipeMentioned}  // Automatically populated!
/>
```

**Benefits:**
- ct-code-editor automatically populates `recipeMentioned`
- No need for event handlers
- Counts and lists update automatically
- Deduplication handled by component

## Pattern: Local Cells for Component Output

When a component has a reactive output (like `$mentioned`), create a local cell to receive it:

```typescript
// Create local cells for component outputs
const inputText = cell<string>("");           // For $value
const mentioned = cell<any[]>([]);            // For $mentioned
const checked = cell<boolean>(false);         // For $checked

// Use computed() for local cells, derive() for pattern input cells
const count = computed(() => mentioned.get().length);
const hasItems = computed(() => mentioned.get().length > 0);

<ct-code-editor
  $value={inputText}
  $mentioned={mentioned}
  $mentionable={mentionable}
/>
```

**Key distinction:**
- Use `derive()` for **pattern input cells** (from interface)
- Use `computed()` for **local cells** created with `cell()`

## Common Reactive Patterns

### 1. Conditional Rendering

```typescript
// ✅ React to data, not events
{ifElse(
  computed(() => items.get().length > 0),
  <div>You have items!</div>,
  <div>No items yet</div>
)}
```

### 2. Derived Counts

```typescript
// ✅ Count updates automatically
const totalItems = computed(() => {
  return items.get().length + otherItems.get().length;
});
```

### 3. Filtered Lists

```typescript
// ✅ Filter recomputes when data changes
const activeItems = computed(() => {
  return items.get().filter(item => item.active);
});
```

### 4. Formatted Display

```typescript
// ✅ Format updates when source changes
const displayName = derive(
  { firstName, lastName },
  ({ firstName: first, lastName: last }) =>
    `${first} ${last}`.trim() || "Anonymous"
);
```

## Anti-Patterns to Avoid

### ❌ Manually Syncing State

```typescript
// Don't do this!
const syncState = handler(() => {
  const data = source.get();
  target.set(data);  // Manual sync
});
```

Instead, use `derive()`:

```typescript
// ✅ Automatic sync
const target = derive(source, (data) => data);
```

### ❌ Checking for Changes in Handlers

```typescript
// Don't do this!
const updateCount = handler(() => {
  const newCount = items.get().length;
  if (newCount !== oldCount) {
    count.set(newCount);
    oldCount = newCount;
  }
});
```

Instead, use `computed()`:

```typescript
// ✅ Always up to date
const count = computed(() => items.get().length);
```

### ❌ Event Handlers for Display Logic

```typescript
// Don't do this!
const updateDisplay = handler(({ detail }) => {
  displayValue.set(format(detail.value));
});

<ct-input onchange={updateDisplay} />
```

Instead, use reactive binding + derive:

```typescript
// ✅ Reactive transformation
<ct-input $value={inputValue} />

const displayValue = derive(inputValue, (value) => format(value));
```

## Testing Observations

**Pattern:** meal-orchestrator.tsx in test-meal-reactive space
**Date:** 2025-11-22

**Event-based approach:**
- Required 74 lines of event handlers
- Manual deduplication logic
- Events didn't fire as expected
- Debugging was difficult

**Reactive approach:**
- Zero event handlers needed
- 4 lines to create local cells
- Component handles everything
- Works immediately

**Performance:** No measurable difference - both reactive.

## Key Takeaways

1. **Default to reactive bindings** - Most CommonTools components provide reactive props
2. **Use `computed()` for local cells** - Created with `cell()`
3. **Use `derive()` for pattern inputs** - From the interface
4. **Events are for side effects** - Not for state synchronization
5. **Less code is better** - Reactive approach is usually simpler

## Related Patterns

- `note.tsx` - Uses `$mentioned` binding with ct-code-editor
- `chatbot.tsx` - Uses `$value` binding with ct-prompt-input
- `meal-orchestrator.tsx` - Full example of reactive wiki-link implementation

## See Also

- [ct-code-editor Wiki-Link Syntax](../superstitions/2025-11-22-ct-code-editor-wiki-link-syntax.md) - Technical details about `[[` syntax
- [@ Reference Support for OpaqueRef Arrays](../superstitions/2025-11-22-at-reference-opaque-ref-arrays.md) - Related pattern for ct-prompt-input
