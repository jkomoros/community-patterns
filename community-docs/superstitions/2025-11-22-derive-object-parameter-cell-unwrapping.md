# Superstition: derive() with Object Parameter Doesn't Auto-Unwrap Cells

**Date:** 2025-11-22
**Author:** jkomoros
**Pattern:** codenames-helper
**Status:** ⬆️ PROMOTED TO FOLK WISDOM (2025-11-22)

**NOTE:** This superstition has been promoted to folk_wisdom after confirming the same behavior in two independent contexts. See: `community-docs/folk_wisdom/derive-object-parameter-cell-unwrapping.md`

## Summary

When using `derive()` with a single Cell, the framework automatically unwraps the value. However, when passing multiple Cells as an object, the framework passes the Cell objects themselves and does NOT unwrap them automatically.

## Observed Behavior

### Works (Single Cell)
```typescript
const message = derive(setupMode, (value) => {
  // value is a boolean, already unwrapped
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

## Technical Details

When debugging with console.log, the object shows:
```
setupMode: <ref *2> CellImpl {
  runtime: <ref *1> Runtime { ... },
  tx: undefined,
  synced: true,
  ...
}
```

This confirms the framework is passing Cell objects, not primitive values.

## Pattern Used

From `patterns/jkomoros/WIP/codenames-helper.tsx` (lines 450-485):
```typescript
prompt: derive({ board, setupMode, myTeam }, (values) => {
  // Unwrap Cell values - derive() doesn't do this automatically when passing an object
  const setupModeValue = (values.setupMode as any).get ? (values.setupMode as any).get() : values.setupMode;
  const boardData: BoardWord[] = (values.board as any).get ? (values.board as any).get() : values.board;
  const myTeamValue: Team = (values.myTeam as any).get ? (values.myTeam as any).get() : values.myTeam;

  // Now use the unwrapped values
  if (setupModeValue) {
    return "Not in game mode yet.";
  }
  // ... rest of logic
});
```

## Impact

This bug caused AI clue generation to silently fail. The derive() callback always returned "Not in game mode yet." because `values.setupMode` (a Cell object) was always truthy, even when the actual boolean value was `false`.

## Rule of Thumb

- **Single Cell:** `derive(cell, callback)` → value is unwrapped automatically
- **Multiple Cells (Object):** `derive({ cell1, cell2 }, callback)` → must call `.get()` manually on each value
- **Always check types** when using derive() with objects if unexpected behavior occurs

## Questions for Framework Authors

1. Is this intentional behavior or a framework limitation?
2. Would it be possible to auto-unwrap Cell values in object parameters?
3. Are there performance or architectural reasons for this design?

## Related Patterns

- codenames-helper.tsx: AI clue generation (lines 450-485)
- Any pattern using derive() with multiple Cells as an object parameter

## Testing

- Tested in: test-jkomoros-27 (debug logging added)
- Fixed in: test-jkomoros-28
- Confirmed with browser console inspection showing CellImpl objects
