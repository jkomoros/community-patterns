# Issue: Reactive Array Item Properties Not Working in JSX Style Attributes

## Summary

When using `Cell<T[]>.map()` in JSX, accessing array item properties within style attributes (using ternary expressions) does not create reactive bindings. The counter that uses `derive()` updates correctly, but the visual styles computed from the same data remain static.

## Expected Behavior

When I update an array item's property (e.g., `word.owner` changes from "unassigned" to "red"), the JSX style attributes that reference that property should reactively update and re-render with the new computed style.

## Actual Behavior

- The data updates correctly (confirmed by counter showing correct values)
- Style attributes computed from array item properties remain static
- Cell backgrounds stay gray instead of changing to the assigned colors

## Minimal Reproduction

Here's a simplified version demonstrating the issue:

```tsx
/// <cts-enable />
import { cell, Cell, Default, derive, handler, ifElse, NAME, pattern, UI } from "commontools";

type WordOwner = "red" | "blue" | "neutral" | "unassigned";

interface BoardWord {
  word: string;
  position: { row: number; col: number };
  owner: WordOwner;
}

function initializeEmptyBoard(): BoardWord[] {
  const board: BoardWord[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      board.push({
        word: "",
        position: { row, col },
        owner: "unassigned",
      });
    }
  }
  return board;
}

const DEFAULT_EMPTY_BOARD = initializeEmptyBoard();

interface CodenamesHelperInput {
  board: Cell<Default<BoardWord[], typeof DEFAULT_EMPTY_BOARD>>;
  selectedWordIndex: Cell<Default<number, 999>>;
}

interface CodenamesHelperOutput {
  board: Cell<BoardWord[]>;
  selectedWordIndex: Cell<number>;
}

// Assign color to selected word
const assignColor = handler<
  unknown,
  { board: Cell<BoardWord[]>; selectedWordIndex: Cell<number>; owner: WordOwner }
>((_event, { board, selectedWordIndex, owner }) => {
  const selIdx = selectedWordIndex.get();
  if (selIdx >= 0 && selIdx < 25) {
    const currentBoard = board.get().slice();
    currentBoard[selIdx] = { ...currentBoard[selIdx], owner };
    board.set(currentBoard);
    selectedWordIndex.set(999); // Deselect
  }
});

// Handle cell click to select
const cellClick = handler<
  unknown,
  { board: Cell<BoardWord[]>; selectedWordIndex: Cell<number>; row: number; col: number }
>((_event, { board, selectedWordIndex, row, col }) => {
  const currentBoard = board.get();
  const index = currentBoard.findIndex((el: BoardWord) =>
    el.position.row === row && el.position.col === col
  );
  if (index >= 0) {
    selectedWordIndex.set(index);
  }
});

export default pattern<CodenamesHelperInput, CodenamesHelperOutput>(
  ({ board, selectedWordIndex }) => {
    return {
      [NAME]: "Reactive Array Styling Test",
      [UI]: (
        <div style={{ padding: "1rem" }}>
          <h1>Reactive Array Item Styling Issue</h1>

          {/* This counter WORKS - it updates reactively */}
          <div>
            <strong>Color Counter (works correctly):</strong>
            {derive(board, (boardData: BoardWord[]) => {
              const counts: Record<WordOwner, number> = {
                red: 0,
                blue: 0,
                neutral: 0,
                unassigned: 0,
              };
              boardData.forEach((word: BoardWord) => {
                counts[word.owner]++;
              });
              return (
                <span>
                  Red: {counts.red}, Blue: {counts.blue},
                  Neutral: {counts.neutral}, Unassigned: {counts.unassigned}
                </span>
              );
            })}
          </div>

          {/* This board grid DOESN'T WORK - colors don't update reactively */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "0.25rem",
            marginTop: "1rem",
            marginBottom: "1rem",
          }}>
            {board.map((word, index) => (
              <div
                key={index}
                style={{
                  aspectRatio: "1",
                  border: "2px solid #000",
                  padding: "0.5rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  // THIS DOESN'T UPDATE REACTIVELY:
                  backgroundColor: word.owner === "red" ? "#dc2626"
                    : word.owner === "blue" ? "#2563eb"
                    : word.owner === "neutral" ? "#d4d4d8"
                    : "#e5e7eb",
                  // THIS ALSO DOESN'T UPDATE REACTIVELY:
                  color: (word.owner === "neutral" || word.owner === "unassigned")
                    ? "black" : "white",
                }}
                onClick={cellClick({ board, selectedWordIndex, row: word.position.row, col: word.position.col })}
              >
                <span style={{ fontSize: "0.7rem" }}>
                  {word.position.row},{word.position.col}
                </span>
              </div>
            ))}
          </div>

          {/* Color assignment buttons */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={assignColor({ board, selectedWordIndex, owner: "red" })}>
              Assign Red
            </button>
            <button onClick={assignColor({ board, selectedWordIndex, owner: "blue" })}>
              Assign Blue
            </button>
            <button onClick={assignColor({ board, selectedWordIndex, owner: "neutral" })}>
              Assign Neutral
            </button>
          </div>
        </div>
      ),
      board,
      selectedWordIndex,
    };
  }
);
```

## Steps to Reproduce

1. Deploy the pattern above to a space
2. Click a cell to select it
3. Click "Assign Red" button
4. Observe:
   - Counter updates from "Unassigned: 25" to "Red: 1, Unassigned: 24" ✓ (works)
   - Cell background stays gray instead of turning red ✗ (doesn't work)

## What I've Tried

### Approach 1: Using `derive()` to pre-compute styles
```tsx
{derive(board, (boardData) => {
  return boardData.map((word, index) => (
    <div style={{ backgroundColor: word.owner === "red" ? "#dc2626" : "#e5e7eb" }}>
      ...
    </div>
  ));
})}
```
**Result:** Board grid disappeared completely, no rendering at all.

### Approach 2: Computed const variables inside `.map()`
```tsx
{board.map((word, index) => {
  const bgColor = word.owner === "red" ? "#dc2626" : "#e5e7eb";
  const textColor = ...;
  return <div style={{ backgroundColor: bgColor, color: textColor }}>...</div>;
})}
```
**Result:** Board didn't render initially.

### Approach 3: Inline ternary expressions (current attempt)
```tsx
{board.map((word, index) => (
  <div style={{
    backgroundColor: word.owner === "red" ? "#dc2626" : "#e5e7eb"
  }}>...</div>
))}
```
**Result:** Board renders initially, but styles don't update when data changes.

### Approach 4: Wrapping in `derive()` with handlers inside
**Result:** Got "Frame mismatch" error with `board_1` being created, suggesting the framework detected conflicting uses of the `board` Cell.

## Context

I'm building a Codenames helper that displays a 5×5 grid of words with team color assignments. The counter (which uses `derive()`) correctly reflects data changes, but the visual appearance of the cells (which should change color based on `word.owner`) remains static.

## Reference Patterns

I've studied these patterns from labs:
- `list-operations.tsx` - Shows `.map()` works with derive for transformations
- `array-in-cell-ast-nocomponents.tsx` - Shows `.map()` works for simple property display in JSX children (`{item.text}`)

However, I couldn't find an example of `.map()` with **computed style attributes** that need to react to array item property changes.

## Questions

1. What's the correct pattern for reactive style computation from array item properties?
2. Should I be using `lift()` or another construct?
3. Is there a way to make inline ternary expressions in style attributes reactive?
4. Should I restructure to use CSS classes computed via `derive()` instead?

## Environment

- Framework: commontools from labs
- Pattern deployed to local dev server (localhost:8000)
- Testing in Chrome via Playwright MCP

## Full Pattern Code

The complete pattern with all features is available at:
`/Users/alex/Code/community-patterns-2/patterns/jkomoros/WIP/codenames-helper.tsx`

Key sections:
- Lines 709-765: Board rendering with `.map()` and inline style ternaries (not reactive)
- Lines 837-876: Color counter using `derive()` (works correctly)
- Lines 237-249: `assignColor` handler that updates the data

Thank you for any guidance on the correct reactive pattern for this use case!
