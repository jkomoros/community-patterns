---
topic: handlers
discovered: 2025-11-29
confirmed_count: 2
last_confirmed: 2025-12-08
sessions: [prompt-injection-tracker-map-approach, verification-testing]
related_labs_docs: ~/Code/labs/docs/common/PATTERNS.md
status: promoted
stars: ⭐⭐⭐
source: framework-author
promoted_to: folk_wisdom/types.md
---

# PROMOTED TO FOLK WISDOM

**This superstition has been promoted to folk wisdom.**

See: `community-docs/folk_wisdom/types.md`

---

**Original content preserved below.**

---

# ⭐⭐⭐ FRAMEWORK AUTHOR CONFIRMED

**This came directly from the framework author** - higher confidence than typical superstitions.

> "Things that tend to screw this up: the agent goes in and manually adds casting away from OpaqueRef (or manually adding it, which I often see in handlers)"
> - Framework author, Nov 2025

---

# DON'T Manually Cast OpaqueRef in Handlers

## Anti-Pattern

Don't manually cast to/from `OpaqueRef` in handler code:

```typescript
// ❌ WRONG - Don't cast away from OpaqueRef
const processItem = handler((_, { item }) => {
  const rawItem = item as unknown as RawItemType;  // Bad!
  // ...
});

// ❌ WRONG - Don't manually add OpaqueRef types
const addItem = handler<unknown, { items: Cell<OpaqueRef<Item>[]> }>(
  (_, { items }) => {
    // Framework handles this automatically
  }
);
```

## Why It's Wrong

1. **Breaks reactivity**: Casting strips the reactive wrapper, breaking the framework's tracking
2. **Hides type errors**: Real issues get masked by the cast
3. **Framework does it automatically**: The framework wraps/unwraps OpaqueRef as needed

## What To Do Instead

Trust the framework's types:

```typescript
// ✅ RIGHT - Use Cell<Item[]> for handler state
const addItem = handler<unknown, { items: Cell<Item[]> }>(
  (_, { items }) => {
    items.push({ title: "New item", done: false });
  }
);

// ✅ RIGHT - Use Default<> for pattern inputs
interface MyInput {
  items: Default<Item[], []>;
}

export default pattern<MyInput>(({ items }) => {
  // items is reactive, framework handles OpaqueRef internally
});
```

## When You See OpaqueRef Type Errors

If you get `OpaqueRef<T>` type errors, the fix is usually:
1. Use `Cell<T[]>` not `Cell<OpaqueRef<T>[]>` in handler signatures
2. Use `Default<T[], []>` in pattern input interfaces
3. Let the framework handle the wrapping

## Context

This guidance came while debugging why a pattern with `generateObject` inside `.map()` wasn't caching properly. The issue was traced to manual OpaqueRef casts that broke the reactive chain.

---

**Confidence level:** HIGH (framework author explicitly called out this anti-pattern)
