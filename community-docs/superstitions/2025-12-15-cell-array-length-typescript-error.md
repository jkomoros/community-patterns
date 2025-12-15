# Cell<T[]> Doesn't Expose .length in TypeScript

**Status:** Superstition (single observation, needs verification)

## The Problem

When you have a `Cell<T[]>` input and try to access `.length` directly in JSX, you get a TypeScript compile-time error:

```typescript
interface MyInput {
  items: Cell<Item[]>;
}

export default pattern<MyInput, MyOutput>(({ items }) => {
  return {
    [UI]: (
      <div>
        {/* ❌ TypeScript Error: Property 'length' does not exist on type 'Cell<Item[]>' */}
        <p>Count: {items.length}</p>
      </div>
    ),
  };
});
```

## Why This Happens

- The TypeScript `Cell<T[]>` type doesn't include array properties like `.length`
- At **runtime**, the framework proxies Cell to expose these properties
- But TypeScript **compile-time** checking doesn't know about the proxy

## Solutions

### Option 1: Don't Check (Like todo-list.tsx)

The canonical `todo-list.tsx` example simply doesn't check for empty or display counts:

```typescript
// ✅ Just render the list - no length checks needed
{items.map((item) => (
  <div>{item.title}</div>
))}
```

### Option 2: Use derive() for Length

If you need the length, use `derive()` which unwraps the Cell:

```typescript
import { derive, ifElse } from "commontools";

// ✅ derive() gives you the raw array
const itemCount = derive(items, (list) => list.length);
const isEmpty = derive(items, (list) => list.length === 0);

// In JSX:
<p>Count: {itemCount}</p>

{ifElse(isEmpty,
  <p>No items yet</p>,
  <div>Has items!</div>
)}
```

### Option 3: Use computed() Where Framework Proxies

Inside `computed()`, argument cells are auto-proxied so direct access works:

```typescript
// ✅ Inside computed(), direct access works at runtime
const count = computed(() => items.length);
```

However, TypeScript may still complain. The safest approach is `derive()`.

## Key Insight

This is a **compile-time vs runtime** distinction:
- **Runtime**: Works fine (framework proxy)
- **Compile-time**: TypeScript error (type doesn't expose `.length`)

## Evidence

- extracurricular-v2.tsx: Compile error on `locations.length`
- todo-list.tsx: Doesn't check length at all (avoids the issue)
- store-mapper.tsx: Uses `computed(() => entrances.length)` inside computed context

## Related Docs

- `superstitions/2025-12-15-argument-cells-in-computed-no-get.md` - Runtime proxy behavior
- `blessed/computed-over-derive.md` - Prefer computed() for transformations

## Metadata

```yaml
topic: cell, array, length, typescript, compile-time
discovered: 2025-12-15
status: superstition
pattern: extracurricular-v2
```

## Guestbook

- 2025-12-15 - Hit this while building extracurricular-v2.tsx Phase 1. Error: "Property 'length' does not exist on type 'Cell<Location[]>'". Fixed by removing the length check (like todo-list.tsx does). (extracurricular-v2 / jkomoros)
