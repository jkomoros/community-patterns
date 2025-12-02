# Cannot Map Over Computed Arrays in JSX

---
confirmed_count: 2
stars: ⭐⭐
sessions:
  - patterns/jkomoros/reward-spinner.tsx
tags:
  - jsx
  - computed
  - reactivity
  - map
---

## The Observation

When you have a computed array and try to `.map()` over it directly in JSX, you get a runtime error:

```
prizes.mapWithPattern is not a function
```

## Context

The framework internally transforms `.map()` calls on reactive arrays to `.mapWithPattern()`. This works for cell arrays (created with `cell<T[]>()` or input arrays), but **computed arrays don't have this method**.

### What Fails

```tsx
const items = computed(() => {
  return [
    { id: 1, label: "Item A" },
    { id: 2, label: "Item B" },
  ];
});

// In JSX - FAILS with "mapWithPattern is not a function"
<div>
  {items.map((item) => (
    <div key={item.id}>{item.label}</div>
  ))}
</div>
```

### What Works

Compute the JSX inside the computed, not the data:

```tsx
const itemsDisplay = computed(() => {
  const data = [
    { id: 1, label: "Item A" },
    { id: 2, label: "Item B" },
  ];
  return data.map((item) => (
    <div key={item.id}>{item.label}</div>
  ));
});

// In JSX - works
<div>{itemsDisplay}</div>
```

Or use a cell array with `.push()`:

```tsx
const items = cell<Array<{ id: number; label: string }>>([]);

// Populate via handler
const addItem = handler((_, { items }) => {
  items.push({ id: Date.now(), label: "New item" });
});

// In JSX - works
<div>
  {items.map((item) => (
    <div key={item.id}>{item.label}</div>
  ))}
</div>
```

## Why This Happens

The framework performs a transformation on `.map()` calls in JSX to enable reactive updates. This transformation expects the array to be a reactive cell array with a `.mapWithPattern()` method. Computed values are read-only snapshots that don't have this special method.

## Verification History

- **2025-12-02**: Verified via pattern cleanup attempt on `reward-spinner.tsx`. Minimal repro appeared to work but used auto-unwrapping input types. Pattern cleanup with explicit `Cell<>` types failed with `mapWithPattern is not a function`, confirming this limitation.

## Guestbook

| Date | Pattern | Notes |
|------|---------|-------|
| 2025-11-21 | reward-spinner.tsx | Original discovery, used computed JSX workaround |
| 2025-12-02 | reward-spinner.tsx | Verified during superstition verification workflow |
