# Folk Wisdom: derive() Works Like React's useMemo

**Date Created:** 2025-11-22
**Updated:** 2025-12-04
**Status:** Folk Wisdom (framework author clarified)

## Summary

`derive()` is analogous to React's `useMemo` - it creates a reactive computation that re-runs when dependencies change. Values passed to the callback are directly usable without any special unwrapping.

## Mental Model

Think of `derive()` like `useMemo`:

```typescript
// React useMemo
const doubled = useMemo(() => count * 2, [count]);

// CommonTools derive (similar concept)
const doubled = derive(count, (value) => value * 2);
```

Both:
- Take dependencies and a computation function
- Re-run when dependencies change
- Return the computed value

## Usage

### Single Dependency
```typescript
const message = derive(setupMode, (value) => {
  // value is directly usable as boolean
  if (value) {
    return "Setup mode active";
  }
  return "Game mode active";
});
```

### Multiple Dependencies (Object)
```typescript
const prompt = derive({ board, setupMode, myTeam }, (values) => {
  // values.setupMode is directly usable as boolean
  // values.board is directly usable as your data type
  if (values.setupMode) {
    return "Not in game mode yet.";
  }
  return `Board has ${values.board.length} words`;
});
```

## TypeScript Types

The types use `OpaqueRef<T>` which is defined as `OpaqueCell<T> & T`. This means:
- TypeScript sees it as compatible with `T`
- You can use values directly without `.get()`
- No type assertions or `@ts-ignore` needed

## Historical Note

Earlier documentation incorrectly suggested that object parameters required manual `.get()` calls. This was based on misinterpreted observations. The framework author clarified (Dec 2025) that:

1. Values ARE directly usable without `.get()`
2. The `OpaqueRef<T> & T` type means values work as `T`
3. The `useMemo` analogy is more accurate than "wrapping/unwrapping"

## See Also

- `computed()` - Even closer to `useMemo`, preferred for new code
- Framework docs on reactivity

## Framework Author Guidance

> "We shouldn't even talk about wrapping or unwrapping until we introduce explicit opaqueness markers. It's really a lot more like useMemo in React, so we could try that analogy (and computed is even closer to that FWIW)."
> — seefeldb (2025-12-04)
