# Superstition: Maps Don't Serialize Well in Framework

**Date Created:** 2025-12-04
**Original Author:** jkomoros
**Status:** Superstition (single observation)
**Confirmed Count:** 1

## Summary

Using JavaScript `Map` objects as computed output values causes runtime errors when the Map is later accessed. The framework seems to serialize/deserialize values in a way that loses Map functionality.

## Observed Behavior

### Didn't Work (Map)
```typescript
const itemMap = computed(() =>
  new Map(items.map((item) => [item.value, item]))
);

// Later in another computed or UI:
computed(() => {
  const map = itemMap;
  const item = map.get(value);  // ERROR: map.get is not a function
  // ...
});
```

**Error:** `TypeError: itemLookup.get is not a function`

### Works (Plain Object)
```typescript
const itemLookup = computed(() => {
  const lookup: Record<string, Item> = {};
  for (const item of items) {
    lookup[item.value] = item;
  }
  return lookup;
});

// Later:
computed(() => {
  const lookup = itemLookup;
  const item = lookup[value];  // Works correctly
  // ...
});
```

## Hypothesis

The framework likely serializes Cell values to JSON for persistence/sync, and `Map` objects don't have a standard JSON representation. When deserialized, they become plain objects that don't have the `.get()` method.

## Workaround

Use plain JavaScript objects (`Record<string, T>`) instead of `Map` for lookup tables in computed outputs.

## Related Issues

This also applies to `Set` objects which similarly don't serialize to JSON well.

## Questions for Framework Authors

1. Is this intentional behavior?
2. Are there plans to support Map/Set serialization?
3. Is there a recommended pattern for complex data structures?

## Guestbook

- **2025-12-04** (search-select component): Discovered when implementing itemMap for value-to-label lookup. Map.get() failed at runtime even though TypeScript compiled fine.
