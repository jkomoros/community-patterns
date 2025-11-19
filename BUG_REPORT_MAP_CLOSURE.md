# Bug Report: Plain Array `.map()` Doesn't Capture Loop Variables in Handlers

## Summary

When using a plain JavaScript array with `.map()` to generate JSX elements with inline `onClick` handlers, loop variables are not properly captured. This works correctly with `Cell<T[]>.map()` but fails with plain arrays like `["red", "blue"].map()`.

## Expected Behavior

Loop variables should be captured in inline handlers, similar to how `Cell<T[]>.map()` automatically captures the item reference.

## Actual Behavior

Loop variables in plain array `.map()` are not captured, causing:
1. All buttons to show the same label (last value or undefined)
2. Handler receives wrong/undefined values
3. Error: "Tried to directly access an opaque value. Use `derive` instead"

## Workaround

Must manually create each element with literal values instead of using `.map()`:

```tsx
// DOESN'T WORK - loop variable not captured
{["red", "blue", "neutral"].map((owner: WordOwner) => (
  <ct-button onClick={assignColor({ board, selectedWordIndex, owner })}>
    {owner}
  </ct-button>
))}

// WORKS - manually created with literals
<ct-button onClick={assignColor({ board, selectedWordIndex, owner: "red" })}>
  red
</ct-button>
<ct-button onClick={assignColor({ board, selectedWordIndex, owner: "blue" })}>
  blue
</ct-button>
```

## Full Failing Code

Here's the complete pattern file that demonstrates the issue:

```tsx
/// <cts-enable />
import { Cell, Default, derive, handler, ifElse, NAME, pattern, UI } from "commontools";

// ===== TYPE DEFINITIONS =====

type Team = "red" | "blue";
type WordOwner = "red" | "blue" | "neutral" | "assassin" | "unassigned";
type WordState = "unrevealed" | "revealed";

interface BoardWord {
  word: string;
  position: { row: number; col: number };
  owner: WordOwner;
  state: WordState;
}

interface CodenamesHelperInput {
  board: Cell<BoardWord[]>;
  myTeam: Cell<Team>;
  setupMode: Cell<boolean>;
  selectedWordIndex: Cell<number>;
}

interface CodenamesHelperOutput {
  board: Cell<BoardWord[]>;
  myTeam: Cell<Team>;
  setupMode: Cell<boolean>;
  selectedWordIndex: Cell<number>;
}

// ===== HELPER FUNCTIONS =====

function getWordColor(owner: WordOwner): string {
  switch (owner) {
    case "red": return "#dc2626";
    case "blue": return "#2563eb";
    case "neutral": return "#d4d4d8";
    case "assassin": return "#000000";
    case "unassigned": return "#e5e7eb";
  }
}

// ===== HANDLERS =====

const assignColor = handler<
  unknown,
  { board: Cell<BoardWord[]>; selectedWordIndex: Cell<number>; owner: WordOwner }
>((_event, { board, selectedWordIndex, owner }) => {
  const selIdx = selectedWordIndex.get();
  if (selIdx >= 0 && selIdx < 25) {
    const currentBoard = board.get().slice();
    currentBoard[selIdx] = { ...currentBoard[selIdx], owner };
    board.set(currentBoard);
    selectedWordIndex.set(-1);
  }
});

// ===== MAIN PATTERN =====

export default pattern<CodenamesHelperInput, CodenamesHelperOutput>(
  ({ board, myTeam, setupMode, selectedWordIndex }) => {
    return {
      [NAME]: "Codenames Helper",
      [UI]: (
        <div>
          {/* THIS DOESN'T WORK - All buttons show "Clear" instead of their actual owner value */}
          {ifElse(
            setupMode,
            <div>
              <h3>Assign Colors</h3>
              <div>
                {(["red", "blue", "neutral", "assassin", "unassigned"] as WordOwner[]).map((owner: WordOwner, idx: number) => (
                  <ct-button
                    key={idx}
                    onClick={assignColor({ board, selectedWordIndex, owner })}
                    style={`background-color: ${getWordColor(owner)};`}
                  >
                    {owner === "unassigned" ? "Clear" : owner}
                  </ct-button>
                ))}
              </div>
            </div>,
            <div>Play Mode</div>
          )}
        </div>
      ),
      board,
      myTeam,
      setupMode,
      selectedWordIndex,
    };
  }
);
```

## What Happens

1. **Button Labels**: All buttons render with label "Clear" (the unassigned case) instead of "red", "blue", "neutral", "assassin", "Clear"
2. **Handler Error**: Clicking any button throws: "Error: Tried to directly access an opaque value. Use `derive` instead"
3. The `owner` variable is not being captured correctly in the closure

## Attempts That Didn't Work

### Attempt 1: Index-based lookup
```tsx
{["red", "blue", "neutral"].map((_, idx: number) => {
  const owner = ["red", "blue", "neutral"][idx];
  return <ct-button onClick={assignColor({ board, selectedWordIndex, owner })} />
})}
```
Result: Same issue - `owner` not captured

### Attempt 2: Type conversion at beginning
```tsx
{["red", "blue"].map((_, idx: number) => {
  const ownerValue: WordOwner = idx === 0 ? "red" : "blue";
  return <ct-button onClick={assignColor({ board, selectedWordIndex, owner: ownerValue })} />
})}
```
Result: Same issue

## Comparison with Cell Arrays

In the store-mapper pattern (recipes/alex/WIP/store-mapper.tsx), using `Cell<T[]>.map()` works perfectly:

```tsx
// THIS WORKS - Cell array properly captures item
{entrances.map((entrance: OpaqueRef<Entrance>) => (
  <ct-button onClick={removeEntrance({ entrances, entrance })}>
    Remove
  </ct-button>
))}
```

The framework automatically handles variable capture for `Cell<T[]>.map()` but not for plain array `.map()`.

## Context

- Framework: commontools (labs repo)
- Pattern: Codenames Helper (community-patterns)
- File: `patterns/jkomoros/WIP/codenames-helper.tsx`

## Suggested Fix

Either:
1. Make plain array `.map()` capture loop variables like `Cell<T[]>.map()` does
2. Document this limitation clearly
3. Provide a helper function for mapping plain arrays with proper capture

## Related Pattern Examples

The store-mapper pattern avoids this by manually creating buttons without `.map()` for static arrays, which is what I had to do as a workaround.
