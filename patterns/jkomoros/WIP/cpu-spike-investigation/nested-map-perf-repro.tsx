/// <cts-enable />
/**
 * @title Nested Map Performance Repro
 * @description Minimal repro for O(n²) scheduler performance with nested maps
 *
 * ## Bug Summary
 *
 * Rendering N items with M sub-items via nested `.map()` causes O(N² × M²)
 * scheduler overhead, resulting in multi-second freezes for modest data sizes.
 *
 * ## Expected Behavior
 * - Rendering 9 items with 5 sub-items each should be instant (<100ms)
 *
 * ## Actual Behavior
 * - ~30 second freeze due to:
 *   1. `scheduler.ts:topologicalSort()` O(n² × m²) nested loops (lines 650-665)
 *   2. `reactive-dependencies.ts` O(n²) splice operations (lines 191-205)
 *   3. `map.ts` O(n) array writes triggering O(n) scheduler cycles
 *
 * ## Root Cause Analysis
 *
 * When nested maps create cells:
 * - 9 outer items × 5 inner items = 45 total cells
 * - Each cell addition triggers scheduler.topologicalSort()
 * - topologicalSort has O(n²) nested loops comparing all action pairs
 * - reactive-dependencies uses Array.splice() in a loop = O(n²)
 * - Result: 45² = 2,025+ comparisons per scheduler cycle
 *
 * ## Framework Files Involved
 *
 * - packages/runner/src/scheduler.ts (lines 650-665) - topologicalSort
 * - packages/runner/src/reactive-dependencies.ts (lines 191-205) - splice
 * - packages/runner/src/builtins/map.ts (lines 108-161) - array writes
 */
import {
  computed,
  Default,
  handler,
  NAME,
  pattern,
  UI,
  Writable,
} from "commontools";

type Item = {
  id: number;
  name: string;
  children: Array<{ id: number; name: string }>;
};

type Props = {
  itemCount: Default<number, 9>;
  childCount: Default<number, 5>;
};

// Handler to trigger the slow render
const triggerRender = handler<
  Record<string, never>,
  { items: Writable<Item[]>; itemCount: number; childCount: number }
>((_, { items, itemCount, childCount }) => {
  // Create nested data structure
  const newItems = Array.from({ length: itemCount }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
    children: Array.from({ length: childCount }, (_, j) => ({
      id: j,
      name: `Child ${i}-${j}`,
    })),
  }));
  items.set(newItems);
});

// Handler to clear items
const clearItems = handler<Record<string, never>, { items: Writable<Item[]> }>(
  (_, { items }) => {
    items.set([]);
  }
);

export default pattern<Props>(({ itemCount, childCount }) => {
  // Start with empty array
  const items = Writable.of<Item[]>([]);

  // Computed for total cell count
  const totalCells = computed(() => {
    const list = items.get();
    if (list.length === 0) return 0;
    return list.length + list.reduce((sum, item) => sum + item.children.length, 0);
  });

  // Computed for status message
  const status = computed(() => {
    const count = items.get().length;
    if (count === 0) return "No items loaded. Click 'Load Items' to trigger the bug.";
    return `Loaded ${count} items with ${totalCells} total cells`;
  });

  return {
    [NAME]: "Nested Map Perf Repro",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>Nested Map Performance Repro</h1>

        <div
          style={{
            backgroundColor: "#fee2e2",
            padding: "0.75rem",
            marginBottom: "1rem",
            borderRadius: "4px",
          }}
        >
          <strong>⚠️ BUG:</strong> This pattern demonstrates O(n²) scheduler
          performance. Loading {itemCount} × {childCount} = {itemCount * childCount} nested items
          should be instant but may take 10-30+ seconds.
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <strong>Status:</strong> {status}
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <ct-button onClick={triggerRender({ items, itemCount, childCount })}>
            Load Items (triggers bug)
          </ct-button>
          <ct-button onClick={clearItems({ items })}>Clear Items</ct-button>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <strong>Configuration:</strong>
          <div>Items: {itemCount} | Children per item: {childCount}</div>
          <div>Total cells: {totalCells}</div>
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
          {items.map((item) => (
            <div
              style={{
                padding: "0.5rem",
                marginBottom: "0.5rem",
                backgroundColor: "#f3f4f6",
                borderRadius: "4px",
              }}
            >
              <strong>{item.name}</strong>
              <div style={{ paddingLeft: "1rem" }}>
                {item.children.map((child) => (
                  <div style={{ fontSize: "0.875rem", color: "#666" }}>
                    └ {child.name}
                  </div>
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
          {`Framework bottlenecks:
1. scheduler.ts:topologicalSort() - O(n² × m²)
   - Lines 650-665: nested loops over all actions
   - For ${totalCells} cells: ~${Math.pow(totalCells, 2)} comparisons

2. reactive-dependencies.ts - O(n²) splice
   - Lines 191-205: Array.splice() inside loop
   - Each insertion shifts remaining elements

3. map.ts - O(n) array writes × O(n) cycles
   - Lines 108-161: writes entire array per item
   - Each write triggers scheduler cycle`}
        </pre>
      </div>
    ),
    items,
    itemCount,
    childCount,
  };
});
