---
topic: patterns, storage, handlers
discovered: 2025-11-25
confirmed_count: 1
last_confirmed: 2025-11-25
sessions: [meal-orchestrator-auto-create-charms]
related_labs_docs: none found
status: superstition
stars: ⭐⭐⭐
source: framework-author
---

# ⚠️ SUPERSTITION - FROM FRAMEWORK AUTHOR

**This guidance comes directly from a framework author** but is documented here as a superstition
until we understand the full context and alternatives.

---

# Never Write OpaqueRef to Storage (allCharms, cells, etc.)

## The Rule

**"If it ever writes OpaqueRef anywhere it is almost certainly on the wrong path"** - Framework Author

When you call a pattern function like `FoodRecipe({...})`, it returns an `OpaqueRef`. This OpaqueRef
should NEVER be written to storage locations like:
- `allCharms` array
- Other cells that persist data
- Any storage mechanism

## What Goes Wrong

Writing an OpaqueRef to storage creates a **reference to non-existent charm data**:

1. `FoodRecipe({...})` returns an OpaqueRef (a pointer/reference)
2. The actual charm data is NOT initialized or persisted
3. Storage now contains a dangling reference
4. When the shell tries to read the charm (e.g., to get `$NAME`), it fails
5. **Result: Entire space becomes corrupted and inaccessible**

### Error Symptoms

```
TypeError: Cannot read properties of undefined (reading '$NAME')
    at _CharmController.name
```

This error repeats for every corrupted entry and prevents ALL charms in the space from loading.

## Code That Triggers This

```typescript
// ❌ WRONG - This corrupts the space!
const applyLinking = handler<
  unknown,
  { allCharms: Cell<any[]> }
>((_event, { allCharms }) => {
  // Calling pattern returns OpaqueRef
  const newCharm = FoodRecipe({
    name: "Test Recipe",
    servings: 4,
  });

  // Writing OpaqueRef to allCharms - CORRUPTS SPACE!
  const currentCharms = allCharms.get();
  allCharms.set([...currentCharms, newCharm]);
});
```

## Why navigateTo Works Differently

`navigateTo(FoodRecipe({...}))` DOES work because `navigateTo` has special runtime logic to:
1. Take the OpaqueRef
2. Properly instantiate and persist the charm through the runtime
3. Navigate to the newly created, fully-realized charm

The OpaqueRef is consumed by `navigateTo`, not written directly to storage.

## What To Do Instead

**Option 1: Use navigateTo** (works but navigates away)
```typescript
// ✅ CORRECT - navigateTo handles persistence
const createRecipe = handler<...>((_event, state) => {
  return navigateTo(FoodRecipe({
    name: "Test Recipe",
    servings: 4,
  }));
});
```

**Option 2: Wait for framework support**
There may be a future API for programmatic charm creation without navigation.
Check with framework authors for current best practices.

## Recovery

If you've corrupted a space:
1. Restart the dev servers (kills in-memory state)
2. Use a new space name for testing
3. The corrupted space data may persist in storage - avoid that space

## Context

Discovered while attempting to implement automatic charm creation in meal-orchestrator pattern.
Goal was to create multiple recipe charms from LLM analysis without navigating away.

The framework author clarified that the approach of pushing OpaqueRefs to allCharms is
fundamentally wrong - the question isn't about how to make it work, but that it's the
wrong approach entirely.

## Questions for Framework Authors

1. What IS the correct way to programmatically create charms without navigateTo?
2. Is there a "createCharm" or "instantiateCharm" primitive planned?
3. Should handlers have access to the runtime for charm creation?

## Related Issues

- `patterns/jkomoros/issues/ISSUE-allCharms-push-corrupts-space.md` - Full bug report
- `patterns/jkomoros/issues/ISSUE-No-Create-Charm-Primitive.md` - Original feature request

---

**Remember:** This is from a framework author, but document any exceptions or clarifications you discover!
