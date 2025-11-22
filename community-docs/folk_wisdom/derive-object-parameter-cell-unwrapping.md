# Folk Wisdom: derive() with Object Parameter Doesn't Auto-Unwrap Cells

**Date Created:** 2025-11-22
**Original Author:** jkomoros
**Status:** Folk Wisdom (multiple confirmations)
**Promoted From:** Superstition (2025-11-22)

## Summary

When using `derive()` with a single Cell, the framework automatically unwraps the value. However, when passing multiple Cells as an object, the framework passes the Cell objects themselves and does NOT unwrap them automatically.

## Confirmed Instances

### Instance 1: AI Clue Generation (codenames-helper)
- **Location:** patterns/jkomoros/WIP/codenames-helper.tsx (lines 450-485)
- **Bug:** AI clue generation silently failed because `values.setupMode` was always truthy (Cell object)
- **Fix:** Manual .get() calls on all Cell values
- **Test Space:** test-jkomoros-27 (debug), test-jkomoros-28 (fixed)

### Instance 2: AI Extraction Preview (codenames-helper)
- **Location:** patterns/jkomoros/WIP/codenames-helper.tsx (lines 986-996)
- **Bug:** Board words preview showed dashes because `result.boardWords` was undefined (accessing property on Cell object)
- **Fix:** Manual .get() calls on pending, result, and approvalState
- **Test Space:** test-jkomoros-29 (fixed)

## Observed Behavior

### Works (Single Cell)
```typescript
const message = derive(setupMode, (value) => {
  // value is a boolean, already unwrapped ✓
  if (value) {
    return "Setup mode active";
  }
  return "Game mode active";
});
```

### Doesn't Work (Object Parameter)
```typescript
const prompt = derive({ board, setupMode, myTeam }, (values) => {
  // BUG: values.setupMode is a CellImpl object, not a boolean!
  if (values.setupMode) {  // Always truthy because Cell object exists
    return "Not in game mode yet.";
  }
  // This code never executes
});
```

### Fix (Manual Unwrapping)
```typescript
const prompt = derive({ board, setupMode, myTeam }, (values) => {
  // Manually unwrap each Cell value
  const setupModeValue = values.setupMode.get();
  const boardData = values.board.get();
  const myTeamValue = values.myTeam.get();

  // Now use the unwrapped values
  if (setupModeValue) {
    return "Not in game mode yet.";
  }
  // Works correctly!
});
```

### Defensive Coding Pattern
```typescript
// Safe unwrapping that handles both Cell and plain values
const prompt = derive({ board, setupMode, myTeam }, (values) => {
  const setupModeValue = (values.setupMode as any).get
    ? (values.setupMode as any).get()
    : values.setupMode;
  const boardData = (values.board as any).get
    ? (values.board as any).get()
    : values.board;
  const myTeamValue = (values.myTeam as any).get
    ? (values.myTeam as any).get()
    : values.myTeam;

  // Use unwrapped values safely
});
```

## Technical Details

When debugging with console.log, Cell objects appear as:
```
setupMode: <ref *2> CellImpl {
  runtime: <ref *1> Runtime { ... },
  tx: undefined,
  synced: true,
  ...
}
```

This confirms the framework is passing Cell objects, not primitive values.

## Rule of Thumb

- **Single Cell:** `derive(cell, callback)` → value is unwrapped automatically ✓
- **Multiple Cells (Object):** `derive({ cell1, cell2 }, callback)` → must call `.get()` manually on each value ✗
- **Always check types** when using derive() with objects if unexpected behavior occurs
- **Symptom:** Conditions on Cell values are always truthy, or accessing properties returns undefined

## Common Bugs This Causes

1. **Always-truthy conditionals**: `if (values.someCell)` always executes because Cell object exists
2. **Undefined property access**: `values.cellWithObject.property` returns undefined
3. **Silent failures**: Logic appears correct but never executes the expected branch
4. **Type errors**: Trying to use Cell object as if it were the underlying value

## Questions for Framework Authors

1. Is this intentional behavior or a framework limitation?
2. Would it be possible to auto-unwrap Cell values in object parameters?
3. Are there performance or architectural reasons for this design?
4. Should this be documented in official framework docs?

## Related Patterns

- codenames-helper.tsx: AI clue generation (lines 450-485)
- codenames-helper.tsx: AI extraction preview (lines 986-996)
- Any pattern using derive() with multiple Cells as an object parameter

## Community Notes

This behavior was discovered independently in two different parts of the same pattern, both causing real bugs that required the same fix. The consistency of this behavior across different contexts suggests it's a fundamental framework design choice rather than a bug.
