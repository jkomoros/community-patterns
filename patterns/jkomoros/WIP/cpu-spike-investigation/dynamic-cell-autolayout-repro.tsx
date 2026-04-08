/// <cts-enable />
/**
 * @title Dynamic Cell + ct-autolayout Repro
 * @description Tests if ct-autolayout triggers the ~35s freeze
 *
 * ## Hypothesis
 *
 * The CTAutoLayout.render error during person.tsx freeze suggests
 * ct-autolayout might be involved. This repro adds ct-autolayout
 * to the dynamic cell creation test.
 *
 * ## What's Different from dynamic-cell-creation-repro.tsx
 *
 * - Uses ct-autolayout with ifElse (like person.tsx)
 * - Form view vs results view (like person.tsx extraction modal)
 */
import {
  handler,
  ifElse,
  NAME,
  pattern,
  safeDateNow,
  UI,
  Writable,
} from "commonfabric";

type Item = {
  id: number;
  children: Array<{ id: number; text: string }>;
};

type Props = Record<string, never>;

// Handler to load data (mimics generateObject completion)
const loadData = handler<
  Record<string, never>,
  {
    items: Writable<Item[]>;
    hasResults: Writable<boolean>;
    outerCount: number;
    innerCount: number;
  }
>((_, { items, hasResults, outerCount, innerCount }) => {
  console.log(
    `[PERF] Loading ${outerCount} × ${innerCount} = ${
      outerCount * innerCount
    } items...`,
  );
  const t0 = safeDateNow();

  const newItems = Array.from({ length: outerCount }, (_, i) => ({
    id: i,
    children: Array.from({ length: innerCount }, (_, j) => ({
      id: j,
      text: `Chunk ${i}-${j}`,
    })),
  }));

  items.set(newItems);
  hasResults.set(true);
  console.log(`[PERF] items.set() took ${safeDateNow() - t0}ms`);
});

// Handler to clear data
const clearData = handler<
  Record<string, never>,
  { items: Writable<Item[]>; hasResults: Writable<boolean> }
>(
  (_, { items, hasResults }) => {
    items.set([]);
    hasResults.set(false);
  },
);

export default pattern<Props>(() => {
  const items = Writable.of<Item[]>([]);
  const hasResults = Writable.of<boolean>(false);
  const outerCount = 9;
  const innerCount = 60;

  return {
    [NAME]: "Dynamic Cell + ct-autolayout Repro",
    [UI]: (
      <cf-screen>
        <div slot="header">
          <h2>ct-autolayout Test</h2>
        </div>

        {ifElse(
          hasResults,
          // Results view (like person.tsx extraction modal)
          <cf-autolayout tabNames={["Results"]}>
            <cf-vscroll flex showScrollbar>
              <cf-vstack style={{ padding: "16px", gap: "8px" }}>
                <h3>Results Loaded</h3>
                <p>Loaded {outerCount * innerCount} items</p>

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
                      {item.children.map((
                        child: { id: number; text: string },
                      ) => (
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

                <cf-button onClick={clearData({ items, hasResults })}>
                  Clear Data
                </cf-button>
              </cf-vstack>
            </cf-vscroll>
          </cf-autolayout>,
          // Form view (like person.tsx form)
          <cf-autolayout tabNames={["Form"]}>
            <cf-vstack style={{ padding: "16px", gap: "12px" }}>
              <div
                style={{
                  backgroundColor: "#fee2e2",
                  padding: "0.75rem",
                  borderRadius: "4px",
                }}
              >
                <strong>⚠️ BUG TEST:</strong>{" "}
                Does ct-autolayout + ifElse + dynamic maps trigger the freeze?
              </div>

              <div>
                <strong>Configuration:</strong>
                <div>
                  Items: {outerCount} × {innerCount} = {outerCount * innerCount}
                </div>
              </div>

              <cf-button
                onClick={loadData({
                  items,
                  hasResults,
                  outerCount,
                  innerCount,
                })}
              >
                Load Data (triggers ifElse switch)
              </cf-button>

              <div style={{ marginTop: "1rem" }}>
                <h3>What This Tests</h3>
                <ul style={{ fontSize: "0.875rem" }}>
                  <li>ct-autolayout with ifElse switching</li>
                  <li>Dynamic nested maps in the "results" branch</li>
                  <li>Same structure as person.tsx extraction modal</li>
                </ul>
              </div>
            </cf-vstack>
          </cf-autolayout>,
        )}
      </cf-screen>
    ),
    items,
  };
});
