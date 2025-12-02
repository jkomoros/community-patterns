/// <cts-enable />
/**
 * Repro: Framework Auto-Boxes Array Items; Use .equals() Instance Method
 *
 * CLAIM: === comparison fails for Cells, must use .equals() instance method
 *
 * Tests:
 * 1. Create array with items
 * 2. In handler, try to find item via ===
 * 3. In handler, try to find item via .equals()
 * 4. Compare results
 */
import { Cell, Default, handler, NAME, pattern, UI } from "commontools";

interface Item {
  id: number;
  name: string;
}

interface Input {
  items: Default<Item[], [{ id: 1, name: "First" }, { id: 2, name: "Second" }, { id: 3, name: "Third" }]>;
  lastResult: Default<string, "Click a button to test">;
}

export default pattern<Input, { [NAME]: string; [UI]: JSX.Element }>(
  ({ items, lastResult }) => {
    // Handler that tries both comparison methods
    const testComparison = handler<
      unknown,
      { items: Cell<Array<Cell<Item>>>; targetItem: Cell<Item>; result: Cell<string> }
    >(
      (_, { items, targetItem, result }) => {
        const currentItems = items.get();

        // Test 1: === comparison
        const indexViaIdentity = currentItems.findIndex(item => item === targetItem);

        // Test 2: .equals() method
        const indexViaEquals = currentItems.findIndex(item => item.equals(targetItem));

        // Get the target name for display
        const targetName = targetItem.get().name;

        result.set(
          `Testing "${targetName}":\n` +
          `=== comparison: index=${indexViaIdentity} (${indexViaIdentity >= 0 ? 'FOUND' : 'NOT FOUND'})\n` +
          `.equals() method: index=${indexViaEquals} (${indexViaEquals >= 0 ? 'FOUND' : 'NOT FOUND'})`
        );
      }
    );

    // Handler to add new item
    const addItem = handler<unknown, { items: Cell<Item[]> }>(
      (_, { items }) => {
        const current = items.get();
        items.push({ id: current.length + 1, name: `Item ${current.length + 1}` });
      }
    );

    // Handler to remove item using .equals()
    const removeViaEquals = handler<
      unknown,
      { items: Cell<Array<Cell<Item>>>; targetItem: Cell<Item>; result: Cell<string> }
    >(
      (_, { items, targetItem, result }) => {
        const currentItems = items.get();
        const index = currentItems.findIndex(item => item.equals(targetItem));

        if (index >= 0) {
          items.set(currentItems.toSpliced(index, 1));
          result.set(`Removed item at index ${index} using .equals()`);
        } else {
          result.set(`Could not find item using .equals()`);
        }
      }
    );

    // Handler to remove item using === (expected to fail)
    const removeViaIdentity = handler<
      unknown,
      { items: Cell<Array<Cell<Item>>>; targetItem: Cell<Item>; result: Cell<string> }
    >(
      (_, { items, targetItem, result }) => {
        const currentItems = items.get();
        const index = currentItems.findIndex(item => item === targetItem);

        if (index >= 0) {
          items.set(currentItems.toSpliced(index, 1));
          result.set(`Removed item at index ${index} using === (UNEXPECTED SUCCESS)`);
        } else {
          result.set(`Could not find item using === (EXPECTED - superstition confirmed)`);
        }
      }
    );

    return {
      [NAME]: "Array Equals Test",
      [UI]: (
        <div style={{ padding: "20px", fontFamily: "system-ui" }}>
          <h2>Cell Array .equals() vs === Test</h2>

          <div style={{ marginBottom: "20px", background: "#f5f5f5", padding: "15px", borderRadius: "8px" }}>
            <h3>Claim</h3>
            <p>=== comparison fails for Cells from .map(), must use .equals() instance method</p>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <button onClick={addItem({ items })} style={{ padding: "8px 16px" }}>
              Add Item
            </button>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <h3>Items (click to test comparison)</h3>
            {items.map((item) => (
              <div style={{ marginBottom: "10px", padding: "10px", background: "#e8e8e8", borderRadius: "4px" }}>
                <span style={{ marginRight: "10px" }}>{item.name}</span>
                <button
                  onClick={testComparison({ items, targetItem: item, result: lastResult })}
                  style={{ marginRight: "5px", padding: "4px 8px" }}
                >
                  Test Both
                </button>
                <button
                  onClick={removeViaEquals({ items, targetItem: item, result: lastResult })}
                  style={{ marginRight: "5px", padding: "4px 8px", background: "#4caf50", color: "white", border: "none" }}
                >
                  Remove (.equals)
                </button>
                <button
                  onClick={removeViaIdentity({ items, targetItem: item, result: lastResult })}
                  style={{ padding: "4px 8px", background: "#f44336", color: "white", border: "none" }}
                >
                  Remove (===)
                </button>
              </div>
            ))}
          </div>

          <div style={{
            background: "#fff3cd",
            padding: "15px",
            borderRadius: "8px",
            whiteSpace: "pre-line"
          }}>
            <h3>Result</h3>
            <p>{lastResult}</p>
          </div>

          <div style={{ marginTop: "20px", padding: "15px", background: "#d4edda", borderRadius: "8px" }}>
            <h3>Interpretation</h3>
            <ul>
              <li>If === returns -1 but .equals() returns correct index → CONFIRMED</li>
              <li>If both work → DISPROVED</li>
            </ul>
          </div>
        </div>
      ),
    };
  }
);
