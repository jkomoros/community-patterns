/// <cts-enable />
/**
 * Repro: Cannot Map Computed Arrays in JSX
 *
 * This demonstrates that mapping over a computed array in JSX fails with
 * "mapWithPattern is not a function".
 *
 * EXPECTED BEHAVIOR: The items list should render and update when clicking the button.
 * ACTUAL BEHAVIOR: Runtime error "items.mapWithPattern is not a function"
 *
 * WORKAROUND: Compute the JSX inside the computed, not the data:
 *   const itemsDisplay = computed(() => {
 *     return data.map((item) => <div>...</div>);
 *   });
 *   // In JSX: {itemsDisplay}
 */
import { computed, handler, NAME, recipe, UI } from "commontools";

export default recipe(
  "computed-array-map-repro",
  ({ counter }: { counter: number }) => {
    // Computed array - mapping over this in JSX will fail
    const items = computed(() => {
      const count = counter;
      return [
        { id: 1, label: `Item A (count: ${count})` },
        { id: 2, label: `Item B (count: ${count})` },
        { id: 3, label: `Item C (count: ${count})` },
      ];
    });

    const increment = handler((_, { counter }) => {
      counter.set(counter.get() + 1);
    });

    return {
      [NAME]: "Computed Array Map Repro",
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h2>Computed Array Map Test</h2>
          <button onClick={increment({ counter })} style={{ padding: "10px 20px", fontSize: "16px" }}>
            Count: {counter}
          </button>
          <div style={{ marginTop: "20px" }}>
            <h3>Items (mapped from computed array):</h3>
            {/* This line causes "mapWithPattern is not a function" */}
            {items.map((item) => (
              <div key={item.id} style={{ padding: "5px", margin: "5px 0", background: "#f0f0f0" }}>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      ),
    };
  }
);
