# Maps and Sets Don't Serialize in Cells

**Date:** 2025-11-30
**Author:** jkomoros
**Status:** Superstition (single observation)

## Observation

JavaScript `Map` and `Set` objects stored in Cells do not serialize/deserialize correctly. When you store a Map or Set in a Cell, then later retrieve it (e.g., in a handler), the object appears to exist but iteration fails with:

```
TypeError: object is not iterable (cannot read property Symbol(Symbol.iterator))
```

## Evidence

In the redactor pattern, session state was initially defined as:

```typescript
interface RedactionSession {
  piiToNonce: Map<string, string>;
  nonceToPii: Map<string, string>;
  usedNonces: Set<string>;
  nonceCounters: Map<string, number>;
}
```

Storing this in a Cell worked fine initially, but when a handler tried to iterate over the Maps/Sets later, it failed. The objects existed but weren't iterable.

## Solution

Use plain objects and arrays instead:

```typescript
interface RedactionSession {
  piiToNonce: Record<string, string>;
  nonceToPii: Record<string, string>;
  usedNonces: string[];
  nonceCounters: Record<string, number>;
}
```

Update access patterns:
- `map.get(key)` → `obj[key]`
- `map.set(key, value)` → `obj[key] = value`
- `map.has(key)` → `key in obj`
- `set.has(value)` → `arr.includes(value)`
- `set.add(value)` → `arr.push(value)`
- `Map.entries()` → `Object.entries()`

## Why This Happens (Hypothesis)

Cells likely use JSON serialization internally. `JSON.stringify()` converts Maps and Sets to empty objects `{}`, losing all data. When deserialized, you get a plain object that looks like a Map/Set but lacks the prototype methods.

## Guestbook

- 2025-11-30 - Discovered in redactor pattern restore handler (jkomoros)
