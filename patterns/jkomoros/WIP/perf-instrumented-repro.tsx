/// <cts-enable />
/**
 * @title Instrumented Performance Repro
 * @description CORRECT performance measurement using call counts, not timing in handlers
 *
 * ## Key Insight from Superstition
 *
 * Timing inside handlers only measures `items.set()` - the actual reactive
 * execution happens ASYNCHRONOUSLY via setTimeout(..., 0). We need to:
 * 1. Count function calls inside map closures
 * 2. Track when the LAST render completes (not when set() returns)
 *
 * ## What This Measures
 *
 * - outerMapCalls: How many times the outer .map() renders an item
 * - innerMapCalls: How many times the inner .map() renders a child
 * - renderCompleteTime: When the LAST item renders (true end-to-end time)
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

// Global counters - these survive across reactive updates
let outerMapCalls = 0;
let innerMapCalls = 0;
let loadStartTime = 0;
let lastRenderTime = 0;

// Handler to load data
const loadData = handler<
  Record<string, never>,
  { items: Cell<Item[]>; outerCount: number; innerCount: number }
>((_, { items, outerCount, innerCount }) => {
  // Reset counters
  outerMapCalls = 0;
  innerMapCalls = 0;
  loadStartTime = Date.now();
  lastRenderTime = 0;

  console.log(`[PERF] ========================================`);
  console.log(`[PERF] Loading ${outerCount} × ${innerCount} = ${outerCount * innerCount} items`);
  console.log(`[PERF] Start time: ${loadStartTime}`);

  const newItems = Array.from({ length: outerCount }, (_, i) => ({
    id: i,
    children: Array.from({ length: innerCount }, (_, j) => ({
      id: j,
      text: `Chunk ${i}-${j}`,
    })),
  }));

  items.set(newItems);

  // This only measures the set() call, NOT the reactive cascade!
  console.log(`[PERF] items.set() returned at ${Date.now()} (${Date.now() - loadStartTime}ms)`);
  console.log(`[PERF] But reactive execution happens LATER via setTimeout!`);
  console.log(`[PERF] Watch for render calls below...`);
});

// Handler to clear data
const clearData = handler<Record<string, never>, { items: Cell<Item[]> }>(
  (_, { items }) => {
    items.set([]);
    console.log(`[PERF] Cleared. Final stats:`);
    console.log(`[PERF]   outerMapCalls: ${outerMapCalls}`);
    console.log(`[PERF]   innerMapCalls: ${innerMapCalls}`);
    console.log(`[PERF]   Total render time: ${lastRenderTime - loadStartTime}ms`);
  }
);

// Handler to show stats
const showStats = handler<Record<string, never>, Record<string, never>>(
  () => {
    console.log(`[PERF] ========================================`);
    console.log(`[PERF] CURRENT STATS:`);
    console.log(`[PERF]   outerMapCalls: ${outerMapCalls}`);
    console.log(`[PERF]   innerMapCalls: ${innerMapCalls}`);
    console.log(`[PERF]   loadStartTime: ${loadStartTime}`);
    console.log(`[PERF]   lastRenderTime: ${lastRenderTime}`);
    console.log(`[PERF]   Total time: ${lastRenderTime - loadStartTime}ms`);
    console.log(`[PERF] ========================================`);
  }
);

export default pattern<Props>(() => {
  const items = Cell.of<Item[]>([]);
  const outerCount = 9;
  const innerCount = 60;

  return {
    [NAME]: "Instrumented Perf Repro",
    [UI]: (
      <div style={{ padding: "1rem", fontFamily: "monospace" }}>
        <h1>Instrumented Performance Repro</h1>

        <div
          style={{
            backgroundColor: "#dbeafe",
            padding: "0.75rem",
            marginBottom: "1rem",
            borderRadius: "4px",
          }}
        >
          <strong>CORRECT MEASUREMENT:</strong> This pattern counts function calls
          inside .map() closures and tracks when the LAST item renders.
          Check console for [PERF] logs.
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <strong>Configuration:</strong> {outerCount} × {innerCount} = {outerCount * innerCount} items
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <ct-button onClick={loadData({ items, outerCount, innerCount })}>
            Load Data
          </ct-button>
          <ct-button onClick={clearData({ items })}>Clear</ct-button>
          <ct-button onClick={showStats({})}>Show Stats</ct-button>
        </div>

        <h2>Rendered Items</h2>
        <div
          style={{
            border: "1px solid #ccc",
            padding: "0.5rem",
            maxHeight: "300px",
            overflow: "auto",
          }}
        >
          {items.map((item: Item) => {
            // COUNT OUTER MAP CALLS - this runs during reactive execution!
            outerMapCalls++;
            lastRenderTime = Date.now();
            if (outerMapCalls <= 3 || outerMapCalls === outerCount) {
              console.log(`[PERF] Outer map #${outerMapCalls} at ${lastRenderTime} (+${lastRenderTime - loadStartTime}ms)`);
            }

            return (
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
                  {item.children.map((child: { id: number; text: string }) => {
                    // COUNT INNER MAP CALLS
                    innerMapCalls++;
                    lastRenderTime = Date.now();

                    // Log first few and last
                    if (innerMapCalls <= 5 || innerMapCalls === outerCount * innerCount) {
                      console.log(`[PERF] Inner map #${innerMapCalls} at ${lastRenderTime} (+${lastRenderTime - loadStartTime}ms)`);
                    }

                    return (
                      <span
                        style={{
                          display: "inline-block",
                          marginRight: "0.25rem",
                          color: "#666",
                        }}
                      >
                        {child.text}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            backgroundColor: "#fef3c7",
            borderRadius: "4px",
          }}
        >
          <strong>How to interpret:</strong>
          <ul style={{ margin: "0.5rem 0", paddingLeft: "1.5rem" }}>
            <li>Open browser console before clicking Load Data</li>
            <li>Watch for [PERF] logs showing map call counts</li>
            <li>The LAST inner map log shows TRUE end-to-end time</li>
            <li>Click "Show Stats" after loading to see totals</li>
          </ul>
        </div>
      </div>
    ),
    items,
  };
});
