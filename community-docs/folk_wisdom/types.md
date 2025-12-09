# Types - Folk Wisdom

Knowledge verified by multiple independent sessions. Still empirical - may not reflect official framework guarantees.

**Official docs:** `~/Code/labs/docs/common/TYPES_AND_SCHEMAS.md`

---

## DON'T Manually Cast OpaqueRef in Handlers

⭐⭐⭐ (Framework author confirmed)

**Source:** Framework author: "Things that tend to screw this up: the agent goes in and manually adds casting away from OpaqueRef (or manually adding it, which I often see in handlers)"

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

### Why It's Wrong

1. **Breaks reactivity**: Casting strips the reactive wrapper, breaking the framework's tracking
2. **Hides type errors**: Real issues get masked by the cast
3. **Framework does it automatically**: The framework wraps/unwraps OpaqueRef as needed

### What To Do Instead

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

### When You See OpaqueRef Type Errors

If you get `OpaqueRef<T>` type errors, the fix is usually:
1. Use `Cell<T[]>` not `Cell<OpaqueRef<T>[]>` in handler signatures
2. Use `Default<T[], []>` in pattern input interfaces
3. Let the framework handle the wrapping

**Related:** `~/Code/labs/docs/common/TYPES_AND_SCHEMAS.md`

**Guestbook:**
- ✅ 2025-11-29 - Framework author explicitly called out this anti-pattern (jkomoros)
- ✅ 2025-12-02 - Verified in VERIFICATION-LOG testing (jkomoros)

---
