# ifElse and Derive Require Consistent Cell Count (Like React Hooks)

## Observation

When using `ifElse()` or `derive()` inside nested maps or conditional contexts, the framework may fail to track reactive updates correctly if different reactive passes create different numbers of cells.

This is conceptually similar to React's "Rules of Hooks" - hooks must be called in the same order and same quantity on every render, or React loses track of state.

## The Problem

Inside `.map()` callbacks or nested reactive contexts:
1. Each reactive pass creates cells via `derive()`, `ifElse()`, etc.
2. The framework tracks cells by their creation order/count
3. If different passes create different numbers of cells (e.g., due to conditional logic), tracking breaks
4. UI may not update correctly, or stale values may persist

## Example - What Doesn't Work

```typescript
// Inside a levels.map() callback:
{levels.map((levelConfig) => {
  // These derives create NEW cells each reactive pass
  const levelIdx = derive(levelConfig, (lc) => lc.index);
  const hasSpindles = derive({ levelIdx, spindles }, (deps) =>
    deps.spindles.some(s => s.levelIndex === deps.levelIdx)
  );

  // ifElse creates conditional cells - count varies per pass!
  return ifElse(
    hasSpindles,
    <ActualSpindle />,
    <Placeholder />
  );
})}
```

**Symptom:** Placeholder cards don't disappear when spindles are created. Both the placeholder AND the actual spindle may render simultaneously.

## The Fix - Compute at Top Level

Move conditional logic to a single top-level derive that returns plain JS data, then render that data:

```typescript
// Compute ONCE at top level - stable cell reference
const orphanLevels = derive(
  { levels, spindles },
  (deps) => {
    const levelIndicesWithSpindles = new Set(
      deps.spindles.map(s => s.levelIndex)
    );
    return deps.levels
      .filter(level => !level.isRoot && !levelIndicesWithSpindles.has(level.index))
      .map(level => ({ index: level.index, title: level.title }));
  }
);

// Render using plain JS map INSIDE derive callback
{derive(orphanLevels, (orphans) => {
  if (!orphans?.length) return null;
  return (
    <div>
      {orphans.map(level => (
        <Placeholder key={level.index} level={level} />
      ))}
    </div>
  );
})}
```

## Why This Works

1. **Single derive at top level** - One stable cell reference for `orphanLevels`
2. **Plain JS inside derive callback** - The `.map()` inside the derive is regular JavaScript, not the reactive `cell.map()`
3. **Consistent cell count** - Every reactive pass creates exactly one derive cell
4. **Automatic reactivity** - When `levels` or `spindles` change, `orphanLevels` recomputes and UI updates

## The Mental Model

Think of the reactive system like React hooks:
- **React:** Call `useState()` same number of times, same order, every render
- **Common Tools:** Create `derive()`/`ifElse()` same number of times, same structure, every reactive pass

When you create derives inside a map callback:
- Pass 1: Creates 3 derives (for 3 items)
- Pass 2: Creates 4 derives (item added)
- Framework: "Wait, which derive is which?" → tracking breaks

## Related

- `2025-11-29-derive-inside-map-causes-thrashing.md` - Similar issue with derive inside map
- `2025-11-29-no-computed-inside-map.md` - Related constraint
- `folk_wisdom/onclick-handlers-conditional-rendering.md` - onClick issues inside ifElse

## Tags

- reactivity
- ifElse
- derive
- map
- consistent-cells
- hooks-rules

## Confirmation Status

- **First observed**: 2025-11-30
- **Confirmed by**: jkomoros - Fixed spindle-board-v2 placeholder rendering issue
- **Needs**: Framework author confirmation on exact cell tracking mechanism
