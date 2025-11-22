# Derives Cannot Mutate Cells - Use Handlers Instead

**Date**: 2025-11-22
**Author**: jkomoros (with Claude)
**Pattern**: food-recipe.tsx
**Status**: Superstition (single observation)

## Summary

Attempting to call `.set()` on Cell objects inside a `derive()` function silently fails. Derives are read-only and cannot mutate cells. For mutations, you must use `handler()` functions instead.

## Context

While implementing LLM timing suggestions in the food-recipe pattern, I attempted to automatically apply timing suggestions using a derive function that would watch for new LLM results and automatically call `.set()` on step group cells to update their timing values.

## What Happened

**Broken approach - Using derive() for mutations**:
```typescript
// ❌ THIS DOESN'T WORK - Derives cannot mutate!
derive(
  { timingSuggestions, stepGroups },
  ({ timingSuggestions: suggestions, stepGroups: groups }) => {
    if (!suggestions || !Array.isArray(suggestions.stepGroups)) return;

    suggestions.stepGroups.forEach((suggestion: any) => {
      const groupIndex = groups.findIndex(g => {
        const groupData = (g.get ? g.get() : g) as StepGroup;
        return groupData.id === suggestion.id;
      });

      if (groupIndex >= 0) {
        const group = groups[groupIndex];
        const groupData = (group.get ? group.get() : group) as StepGroup;

        // This silently fails! .set() is undefined in derive context
        if ((group as any).set) {
          console.log('[AUTO-APPLY] group has .set?', (group as any).set, group);
          (group as any).set({
            ...groupData,
            nightsBeforeServing: suggestion.nightsBeforeServing,
            minutesBeforeServing: suggestion.minutesBeforeServing,
          });
        }
      }
    });
  },
);
```

**Console output**:
```
[AUTO-APPLY] group has .set? undefined undefined
```

The `.set()` method simply doesn't exist in the derive context. The code runs without errors, but no mutation occurs.

**Working approach - Using handler() for mutations**:
```typescript
// ✅ THIS WORKS - Handlers can mutate!
const applyTimingSuggestions = handler<
  Record<string, never>,
  {
    timingSuggestions: Cell<any>;
    stepGroups: Cell<Array<Cell<StepGroup>>>;
  }
>(
  (_, { timingSuggestions, stepGroups }) => {
    const suggestions = timingSuggestions.get();
    if (!suggestions || !Array.isArray(suggestions.stepGroups)) return;

    const currentGroups = stepGroups.get();

    suggestions.stepGroups.forEach((suggestion: any) => {
      const groupIndex = currentGroups.findIndex(g => {
        const groupData = (g.get ? g.get() : g) as StepGroup;
        return groupData.id === suggestion.id;
      });

      if (groupIndex >= 0) {
        const group = currentGroups[groupIndex];
        const groupData = (group.get ? group.get() : group) as StepGroup;

        // This works! Handlers CAN call .set()
        if ((group as any).set) {
          (group as any).set({
            ...groupData,
            nightsBeforeServing: suggestion.nightsBeforeServing,
            minutesBeforeServing: suggestion.minutesBeforeServing,
            duration: suggestion.duration ?? groupData.duration,
          });
        }
      }
    });

    timingSuggestions.set(null);
  },
);
```

## Solution

**Pattern for mutations**:
1. Use `derive()` for **read-only** computations (showing UI, comparing values, etc.)
2. Use `handler()` for **mutations** (calling `.set()` on cells)
3. If you need user-triggered mutations based on reactive data:
   - Use `derive()` to compute what should change
   - Show preview UI with an Apply button
   - Wire the Apply button to a `handler()` that performs the actual mutation

**Example - Modal with Apply button**:
```typescript
// Derive to check if we should show the modal
const hasTimingSuggestions = derive(
  timingSuggestions,
  (result) => result && Array.isArray(result.stepGroups)
);

// UI with Apply button
{ifElse(
  hasTimingSuggestions,
  <ct-card>
    <h3>Review Timing Suggestions</h3>
    {/* Show preview of changes */}
    <ct-button onClick={applyTimingSuggestions({ timingSuggestions, stepGroups })}>
      Apply
    </ct-button>
  </ct-card>,
  <div />
)}
```

## Why This Matters

This is a fundamental constraint of the CommonTools reactive system:
- **Derives are pure functions** - They compute derived values without side effects
- **Handlers are for side effects** - They can mutate state, make API calls, etc.

Attempting to mutate in a derive will silently fail, leading to confusing debugging where everything looks correct but nothing happens.

## Related Patterns

- food-recipe.tsx (lines 576-667): Working handler examples
- food-recipe.tsx (lines 1733-1933): Modal + handler pattern for user-approved mutations

## Questions for Framework Authors

1. Could derives throw an error if they try to access `.set()` on a Cell, rather than silently failing?
2. Is there documentation explaining the derive vs handler distinction for mutations?
3. Are there any cases where derives should be able to mutate, or is this restriction by design?

## Tags

#reactivity #cells #derives #handlers #mutations #debugging
