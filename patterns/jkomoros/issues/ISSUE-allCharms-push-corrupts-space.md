# Issue: Pushing Pattern Results to allCharms Corrupts Space

## Summary

Attempting to programmatically create charms by calling a pattern function and pushing the result to `allCharms` corrupts the space, causing `TypeError: Cannot read properties of undefined (reading '$NAME')` errors that prevent all patterns in that space from loading.

## Severity

**Critical** - Corrupts entire space, requires server restart to recover. All charms in the affected space become inaccessible.

## Steps to Reproduce

1. Create a pattern that wishes for allCharms:
```typescript
const { allCharms } = wish<{ allCharms: any[] }>("/");
```

2. Create a handler that receives allCharms as a Cell and tries to create a new charm:
```typescript
const createCharm = handler<
  unknown,
  { allCharms: Cell<any[]> }
>((_event, { allCharms }) => {
  // Call another pattern to create a charm
  const newCharm = FoodRecipe({
    name: "Test Recipe",
    servings: 4,
    // ... other inputs
  });

  // Push to allCharms (THIS CORRUPTS THE SPACE)
  const currentCharms = allCharms.get();
  allCharms.set([...currentCharms, newCharm]);
});
```

3. Trigger the handler (e.g., via button click)

4. **Result**:
   - Items appear temporarily in UI with missing data (shows "• servings" instead of names)
   - New charms do NOT appear in All Charms list
   - After page refresh, space fails to load with repeated errors:
     ```
     TypeError: Cannot read properties of undefined (reading '$NAME')
         at _CharmController.name
     ```
   - ALL charms in the space become inaccessible
   - Server restart required to recover (clears corrupted state)

## Expected Behavior

Either:
1. The charm should be properly created and persisted, OR
2. The operation should fail gracefully with a clear error message, without corrupting the space

## Actual Behavior

1. `FoodRecipe({...})` returns an OpaqueRef
2. OpaqueRef gets added to allCharms array
3. However, the underlying charm data is NOT properly initialized/persisted
4. Space now contains references to non-existent charm data
5. Shell crashes when iterating allCharms and trying to read `$NAME` from undefined

## Context

This was attempted based on framework author guidance:
> "you can wish for the all charms cell and just .push a new charm on it (see default-app.tsx as example)"

The `default-app.tsx` example shows removing charms from allCharms, but not adding new ones. The assumption was that adding would work similarly to removing, but it does not.

## Comparison with navigateTo

Using `navigateTo(FoodRecipe({...}))` DOES work correctly - it creates a persistent charm. However, this navigates away from the current pattern, which is not the desired UX for batch operations.

## Code That Triggers the Issue

Full handler from meal-orchestrator.tsx:
```typescript
const applyLinking = handler<
  unknown,
  {
    linkingResult: AnalysisResult | null;
    mentionable: any[];
    allCharms: Cell<any[]>;
    recipeMentioned: Cell<any[]>;
    preparedFoodMentioned: Cell<any[]>;
    linkingAnalysisTrigger: Cell<string>;
  }
>((_event, { linkingResult, mentionable, allCharms, recipeMentioned, preparedFoodMentioned, linkingAnalysisTrigger }) => {
  // ... validation code ...

  const newCharmsToCreate: any[] = [];

  selectedItems.forEach((matchResult) => {
    const { item, match } = matchResult;

    if (!match) {
      // Create new charm
      const newCharm = item.type === "recipe"
        ? FoodRecipe({ name: item.normalizedName, /* ... */ })
        : PreparedFood({ name: item.normalizedName, /* ... */ });

      newCharmsToCreate.push(newCharm);
    }
  });

  // THIS LINE CORRUPTS THE SPACE:
  if (newCharmsToCreate.length > 0) {
    const currentCharms = allCharms.get();
    allCharms.set([...currentCharms, ...newCharmsToCreate]);
  }

  // ... rest of handler ...
});
```

## Questions for Framework Authors

1. Is there a supported way to programmatically create charms without using `navigateTo`?
2. Should calling `Pattern({...})` inside a handler work differently than in the pattern body?
3. Can the framework detect and prevent this corruption scenario?
4. Is there a way to "instantiate" the OpaqueRef before adding to allCharms?

## Environment

- Framework: CommonTools (labs repo)
- Pattern: meal-orchestrator.tsx
- Date: 2025-11-25

## Workaround

Use `navigateTo` with individual "Create" buttons instead of batch creation. This works but requires user to navigate away and back for each new charm.
