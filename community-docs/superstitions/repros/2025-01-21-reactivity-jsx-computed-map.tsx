/// <cts-enable />
/**
 * Minimal repro for superstition: 2025-01-21-reactivity-recipe-pattern-migration-jsx.md
 *
 * Tests two claims:
 * 1. Direct conditionals in JSX don't react
 * 2. Cannot map over computed arrays in JSX (error: "map is not a function")
 *
 * Expected behavior (if superstition is wrong):
 * - Clicking increment should update the display reactively
 * - The computed array should be mappable in JSX
 */

import {
  Cell,
  computed,
  Default,
  handler,
  NAME,
  recipe,
  UI,
} from "commontools";

interface Input {
  counter: Default<number, 0>;
}

// Handler to increment counter
const increment = handler<unknown, { counter: Cell<Default<number, 0>> }>(
  (_, { counter }) => {
    counter.set(counter.get() + 1);
  }
);

export default recipe<Input, Input>(({ counter }) => {
  // Claim 2: Test if we can map over a computed array
  // Superstition says this gives "map is not a function" error
  const items = computed(() => {
    const count = counter; // reactive dependency
    return [
      { id: 1, label: `Item A (count: ${count})` },
      { id: 2, label: `Item B (count: ${count})` },
      { id: 3, label: `Item C (count: ${count})` },
    ];
  });

  // Also test: computed boolean for conditional
  const showVariantA = computed(() => (counter ?? 0) % 2 === 0);

  return {
    [NAME]: "Reactivity JSX Test",
    [UI]: (
      <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
        <h2>Superstition Verification: JSX Reactivity</h2>

        <div style={{ marginBottom: "20px" }}>
          <ct-button onClick={increment({ counter })}>
            Increment Counter
          </ct-button>
          <span style={{ marginLeft: "10px" }}>Counter: {counter}</span>
        </div>

        <hr />

        <h3>Test 1: Direct conditional in JSX</h3>
        <p>Superstition claims direct conditionals evaluate once</p>
        <div
          style={{
            padding: "10px",
            backgroundColor: (counter ?? 0) % 2 === 0 ? "#d4edda" : "#f8d7da",
          }}
        >
          {(counter ?? 0) % 2 === 0 ? (
            <div>🟢 VARIANT A (even counter)</div>
          ) : (
            <div>🔴 VARIANT B (odd counter)</div>
          )}
        </div>

        <hr />

        <h3>Test 2: Map over computed array</h3>
        <p>Superstition claims: "payoutDots.map is not a function"</p>
        <div style={{ backgroundColor: "#e9ecef", padding: "10px" }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{ padding: "5px", borderBottom: "1px solid #ccc" }}
            >
              {item.label}
            </div>
          ))}
        </div>

        <hr />

        <h3>Test 3: Computed boolean conditional</h3>
        <p>This is the suggested fix from the superstition</p>
        <div
          style={{
            padding: "10px",
            backgroundColor: showVariantA ? "#cce5ff" : "#fff3cd",
          }}
        >
          {showVariantA ? (
            <div>🔵 Computed says EVEN</div>
          ) : (
            <div>🟡 Computed says ODD</div>
          )}
        </div>
      </div>
    ),
    counter,
  };
});
