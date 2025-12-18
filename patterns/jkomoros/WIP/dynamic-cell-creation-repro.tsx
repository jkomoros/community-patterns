/// <cts-enable />
/**
 * @title Dynamic Cell Creation Performance Repro
 * @description Minimal repro for O(n²) performance during dynamic cell creation
 *
 * ## Bug Summary
 *
 * When cells are created DYNAMICALLY (not at startup), the framework exhibits
 * O(n²) performance due to splice operations in reactive-dependencies.ts.
 *
 * ## Key Insight
 *
 * Our previous repros were FAST because they created cells at startup (static data).
 * person.tsx is SLOW because it creates cells DYNAMICALLY when generateObject completes.
 *
 * ## How This Repro Works
 *
 * 1. Starts with EMPTY data (no map items)
 * 2. Button click triggers sudden data load (mimics generateObject completion)
 * 3. `.map()` must create 540+ new cells at once
 * 4. Each cell creation triggers O(n) splice → total O(n²) = 291,600 operations
 *
 * ## Expected Result
 *
 * If O(n²) theory is correct:
 * - Click "Load Data" → 30+ second freeze → UI updates
 */
import {
  Cell,
  handler,
  NAME,
  pattern,
  UI,
} from "commontools";

type Item = {
  id: number;
  children: Array<{ id: number; text: string }>;
};

type Props = Record<string, never>;

// Handler to load data (mimics generateObject completion)
const loadData = handler<
  Record<string, never>,
  { items: Cell<Item[]>; outerCount: number; innerCount: number }
>((_, { items, outerCount, innerCount }) => {
  console.log(`[PERF] Loading ${outerCount} × ${innerCount} = ${outerCount * innerCount} items...`);
  const t0 = Date.now();

  // Suddenly create many items (mimics generateObject completion)
  const newItems = Array.from({ length: outerCount }, (_, i) => ({
    id: i,
    children: Array.from({ length: innerCount }, (_, j) => ({
      id: j,
      text: `Chunk ${i}-${j}`,
    })),
  }));

  items.set(newItems); // This triggers O(n²) cell creation

  console.log(`[PERF] items.set() took ${Date.now() - t0}ms`);
});

// Handler to clear data
const clearData = handler<Record<string, never>, { items: Cell<Item[]> }>(
  (_, { items }) => {
    items.set([]);
  }
);

export default pattern<Props>(() => {
  // Start EMPTY - this is crucial for testing dynamic cell creation
  const items = Cell.of<Item[]>([]);

  // Configuration for testing different scales
  const outerCount = 9; // Like changesPreview (9 extracted fields)
  const innerCount = 60; // Like notesDiffChunks (60+ diff chunks)

  return {
    [NAME]: "Dynamic Cell Creation Repro",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>Dynamic Cell Creation Performance Repro</h1>

        <div
          style={{
            backgroundColor: "#fee2e2",
            padding: "0.75rem",
            marginBottom: "1rem",
            borderRadius: "4px",
          }}
        >
          <strong>⚠️ BUG TEST:</strong> This tests O(n²) performance during
          DYNAMIC cell creation. Previous repros were fast because they used
          STATIC data at startup.
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <strong>Configuration:</strong>
          <div>
            Outer items: {outerCount} | Inner items per outer: {innerCount}
          </div>
          <div>Total items: {outerCount * innerCount}</div>
          <div>
            Expected O(n²) operations: ~{(outerCount * innerCount) ** 2}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <ct-button onClick={loadData({ items, outerCount, innerCount })}>
            Load Data (triggers O(n²))
          </ct-button>
          <ct-button onClick={clearData({ items })}>Clear Data</ct-button>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <strong>Status:</strong> Click button to load data
        </div>

        <h2>Rendered Items (nested map)</h2>
        <div
          style={{
            border: "1px solid #ccc",
            padding: "0.5rem",
            maxHeight: "400px",
            overflow: "auto",
          }}
        >
          {items.map((item: Item) => (
            <div
              style={{
                padding: "0.25rem 0.5rem",
                marginBottom: "0.25rem",
                backgroundColor: "#f3f4f6",
                borderRadius: "4px",
              }}
            >
              <strong>Item {item.id}</strong>
              <div style={{ paddingLeft: "1rem", fontSize: "0.75rem" }}>
                {item.children.map((child: { id: number; text: string }) => (
                  <span
                    style={{
                      display: "inline-block",
                      marginRight: "0.25rem",
                      color: "#666",
                    }}
                  >
                    {child.text}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ marginTop: "1rem" }}>Debug Info</h2>
        <pre
          style={{
            backgroundColor: "#f3f4f6",
            padding: "0.5rem",
            fontSize: "0.75rem",
            overflow: "auto",
          }}
        >
          {`This pattern tests dynamic cell creation:

1. Starts with EMPTY items array
2. Click "Load Data" to suddenly create ${outerCount * innerCount} items
3. Each item in .map() creates a new charm instance
4. Each child in nested .map() creates another charm instance
5. O(n²) splice in reactive-dependencies.ts fires for each

person.tsx flow that triggers this:
- generateObject completes → extractionResult updates
- changesPreview computed returns ~9 items
- notesDiffChunks computed returns ~60 chunks
- Nested .map() creates 9 × 60 = 540+ cells dynamically
- O(n²) → 540² = 291,600 operations → ~30s freeze

If this repro triggers ~30s freeze, the O(n² theory is confirmed.`}
        </pre>
      </div>
    ),
    items,
  };
});
